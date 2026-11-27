/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useCallback, useEffect, useMemo, useState, type FormEvent } from 'react';
import { Link } from 'react-router-dom';
import { useTranslation } from 'react-i18next';
import {
  Activity,
  CheckCircle2,
  Database,
  Globe,
  HeartPulse,
  Info,
  Loader2,
  Lock,
  RefreshCw,
  Search,
  Server,
  XCircle,
} from 'lucide-react';

import { CopyButton } from '@/components/common/CopyButton';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import {
  fetchEmailDiscovery,
  fetchHealthStatus,
  fetchPrometheusConfig,
  fetchPrometheusSnapshot,
  type EmailDiscoveryResult,
  type EndpointHealth,
  type HealthSnapshot,
  type PrometheusConfigInfo,
  type PrometheusSnapshotResult,
} from '@/features/diagnostics/diagnosticsApi';
import { usePermissionCheckers } from '@/hooks/usePermissions';
import { formatNumber } from '@/lib/format';
import { layoutViewFor } from '@/lib/layout';
import { cn } from '@/lib/utils';
import { useAuthStore } from '@/stores/authStore';
import { useSchemaStore } from '@/stores/schemaStore';

function HealthProbeCard({
  title,
  endpoint,
  probe,
  loading,
}: {
  title: string;
  endpoint: string;
  probe: EndpointHealth | undefined;
  loading: boolean;
}) {
  const { t } = useTranslation();
  const ok = probe?.ok ?? false;

  return (
    <Card className={cn(probe && !ok && 'border-destructive/60')}>
      <CardContent className="flex items-start justify-between gap-3 p-4">
        <div className="min-w-0 space-y-1">
          <p className="text-sm font-medium text-foreground">{title}</p>
          <p className="truncate font-mono text-xs text-muted-foreground">{endpoint}</p>
          {probe && (
            <p className="text-xs tabular-nums text-muted-foreground">
              {probe.error
                ? probe.error
                : t('diagnostics.probeStatus', 'HTTP {{status}} · {{ms}} ms', {
                    status: probe.status,
                    ms: probe.elapsedMs,
                  })}
            </p>
          )}
        </div>
        {loading && !probe ? (
          <Loader2 className="h-4 w-4 shrink-0 animate-spin text-muted-foreground" aria-hidden="true" />
        ) : ok ? (
          <Badge variant="outline" className="shrink-0 gap-1 border-emerald-500/40 text-emerald-700 dark:text-emerald-400">
            <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
            {t('diagnostics.healthy', 'Healthy')}
          </Badge>
        ) : (
          <Badge variant="destructive" className="shrink-0 gap-1">
            <XCircle className="h-3 w-3" aria-hidden="true" />
            {t('diagnostics.unhealthy', 'Unavailable')}
          </Badge>
        )}
      </CardContent>
    </Card>
  );
}

/**
 * Community Health & Autodiscover Diagnostics page backed by Stalwart's non-Enterprise endpoints:
 * `/healthz/live`, `/healthz/ready`, `/api/discover/<email>`, `config-v1.1.xml`, and `/metrics/prometheus`.
 */
export function CommunityHealthPage() {
  const { t } = useTranslation();
  const schema = useSchemaStore((s) => s.schema);
  const viewToSection = useSchemaStore((s) => s.viewToSection);
  const { canGet } = usePermissionCheckers();
  const defaultAccountEmail = useAuthStore((s) => {
    const active = s.activeAccountId ? s.accounts[s.activeAccountId] : undefined;
    return active?.name ?? '';
  });

  const [health, setHealth] = useState<HealthSnapshot | null>(null);
  const [healthManualLoading, setHealthManualLoading] = useState(false);

  const [discoverEmail, setDiscoverEmail] = useState(defaultAccountEmail);
  const [discovery, setDiscovery] = useState<EmailDiscoveryResult | null>(null);
  const [discoverManualLoading, setDiscoverManualLoading] = useState(false);

  const [promConfig, setPromConfig] = useState<PrometheusConfigInfo | null>(null);
  const [prom, setProm] = useState<PrometheusSnapshotResult | null>(null);
  const [promManualLoading, setPromManualLoading] = useState(false);
  const [promQuery, setPromQuery] = useState('');
  const [hideZeroMetrics, setHideZeroMetrics] = useState(true);
  const [promUsername, setPromUsername] = useState('');
  const [promPassword, setPromPassword] = useState('');
  const [promAuthFailed, setPromAuthFailed] = useState(false);

  const metricsSettingsHref = useMemo(() => {
    if (!schema) return null;
    const viewName = layoutViewFor(schema, viewToSection, 'x:Metrics');
    if (!viewName) return null;
    const section = viewToSection[viewName];
    return section ? `/${section}/${viewName}/singleton` : null;
  }, [schema, viewToSection]);

  const healthLoading = health === null || healthManualLoading;
  const discoverLoading = discoverManualLoading || (defaultAccountEmail.includes('@') && discovery === null);
  const promLoading = promConfig === null || (promConfig.mode === 'open' && prom === null) || promManualLoading;

  const refreshHealth = useCallback(async () => {
    setHealthManualLoading(true);
    try {
      const next = await fetchHealthStatus();
      setHealth(next);
    } finally {
      setHealthManualLoading(false);
    }
  }, []);

  const refreshPrometheus = useCallback(async () => {
    setPromManualLoading(true);
    try {
      const creds =
        promUsername.trim() && promPassword
          ? { username: promUsername.trim(), password: promPassword }
          : undefined;
      if (promConfig?.mode === 'basicAuth' && !creds) {
        return;
      }
      const next = await fetchPrometheusSnapshot({ credentials: creds });
      setProm(next);
    } finally {
      setPromManualLoading(false);
    }
  }, [promConfig, promUsername, promPassword]);

  useEffect(() => {
    const controller = new AbortController();
    let cancelled = false;

    void fetchHealthStatus(controller.signal)
      .then((next) => {
        if (!cancelled) setHealth(next);
      })
      .catch(() => {});

    // Inspect x:Metrics config first so Basic-Auth endpoints never trigger an unexpected browser login popup on mount.
    void fetchPrometheusConfig(schema, canGet, controller.signal)
      .then((info) => {
        if (cancelled) return;
        setPromConfig(info);
        if (info.mode === 'disabled') {
          setProm({ status: 'disabled' });
        } else if (info.mode === 'basicAuth') {
          if (info.username) setPromUsername((prev) => prev || info.username);
          setProm({ status: 'authRequired' });
        } else if (info.mode === 'open') {
          return fetchPrometheusSnapshot({ signal: controller.signal }).then((next) => {
            if (!cancelled) setProm(next);
          });
        }
      })
      .catch(() => {
        if (!cancelled) setPromConfig({ mode: 'unknown' });
      });

    if (defaultAccountEmail.includes('@')) {
      void fetchEmailDiscovery(defaultAccountEmail, controller.signal)
        .then((next) => {
          if (!cancelled) setDiscovery(next);
        })
        .catch(() => {});
    }

    return () => {
      cancelled = true;
      controller.abort();
    };
  }, [schema, canGet, defaultAccountEmail]);

  const handleDiscoverSubmit = async (event: FormEvent) => {
    event.preventDefault();
    if (!discoverEmail.trim()) return;
    setDiscoverManualLoading(true);
    try {
      const next = await fetchEmailDiscovery(discoverEmail);
      setDiscovery(next);
    } finally {
      setDiscoverManualLoading(false);
    }
  };

  const handlePrometheusAuthSubmit = async (event: FormEvent) => {
    event.preventDefault();
    setPromManualLoading(true);
    setPromAuthFailed(false);
    try {
      const creds =
        promUsername.trim() && promPassword
          ? { username: promUsername.trim(), password: promPassword }
          : undefined;
      const next = await fetchPrometheusSnapshot({ credentials: creds });
      setProm(next);
      setPromAuthFailed(next.status === 'authRequired');
    } finally {
      setPromManualLoading(false);
    }
  };

  const filteredMetrics = useMemo(() => {
    if (!prom || prom.status !== 'ok') return [];
    const tokens = promQuery
      .toLowerCase()
      .split(/\s+/)
      .filter(Boolean);
    return prom.metrics.filter((m) => {
      if (hideZeroMetrics && m.value === 0) return false;
      if (tokens.length === 0) return true;
      const haystack = `${m.name} ${m.help} ${m.labels ?? ''}`.toLowerCase();
      return tokens.every((tok) => haystack.includes(tok));
    });
  }, [prom, promQuery, hideZeroMetrics]);

  return (
    <div className="mx-auto w-full max-w-5xl space-y-8 pt-2">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div className="flex items-center gap-3">
          <HeartPulse className="h-7 w-7 shrink-0 text-brand-text" aria-hidden="true" />
          <div className="space-y-1">
            <h1 className="page-title">{t('diagnostics.title', 'System Health & Autodiscover')}</h1>
            <p className="text-sm text-muted-foreground">
              {t(
                'diagnostics.subtitle',
                'Verify storage readiness, client discovery endpoints, and Community Prometheus metrics.',
              )}
            </p>
          </div>
        </div>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={() => {
            void refreshHealth();
            if (prom?.status === 'ok') void refreshPrometheus();
          }}
          disabled={healthLoading || promManualLoading}
        >
          {healthLoading || promManualLoading ? (
            <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />
          ) : (
            <RefreshCw className="mr-2 h-4 w-4" aria-hidden="true" />
          )}
          {t('diagnostics.refreshAll', 'Refresh')}
        </Button>
      </div>

      {/* Section 1: HTTP Liveness & Storage Readiness */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Database className="h-4 w-4" aria-hidden="true" />
          <h2>{t('diagnostics.healthSection', 'Server & Storage Health')}</h2>
        </div>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <HealthProbeCard
            title={t('diagnostics.livenessTitle', 'HTTP Liveness')}
            endpoint="/healthz/live"
            probe={health?.live}
            loading={healthLoading}
          />
          <HealthProbeCard
            title={t('diagnostics.readinessTitle', 'Storage Readiness')}
            endpoint="/healthz/ready"
            probe={health?.ready}
            loading={healthLoading}
          />
        </div>
      </section>

      {/* Section 2: /api/discover/<email> & Mail Client Autoconfig */}
      <section className="space-y-3">
        <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
          <Globe className="h-4 w-4" aria-hidden="true" />
          <h2>{t('diagnostics.discoverSection', 'Client Discovery & Mail Autoconfig')}</h2>
        </div>
        <Card>
          <CardContent className="space-y-4 p-4">
            <form onSubmit={(e) => void handleDiscoverSubmit(e)} className="flex flex-wrap items-center gap-2">
              <Input
                type="email"
                value={discoverEmail}
                onChange={(e) => setDiscoverEmail(e.target.value)}
                placeholder={t('diagnostics.emailPlaceholder', 'user@example.com')}
                aria-label={t('diagnostics.emailLabel', 'Account email for discovery')}
                className="min-w-60 flex-1"
              />
              <Button type="submit" disabled={discoverLoading || !discoverEmail.trim()}>
                {discoverLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                {t('diagnostics.checkDiscovery', 'Check Discovery')}
              </Button>
            </form>

            {discovery && (
              <div className="space-y-4 pt-1">
                {discovery.mailServers.length > 0 && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-1.5 text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      <Server className="h-3.5 w-3.5" aria-hidden="true" />
                      <span>{t('diagnostics.mailEndpoints', 'Mail Client Servers (autoconfig XML)')}</span>
                    </div>
                    <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
                      {discovery.mailServers.map((srv, idx) => (
                        <div
                          key={`${srv.direction}-${srv.protocol}-${srv.port}-${idx}`}
                          className="rounded-lg border border-border bg-muted/40 px-3 py-2 text-xs"
                        >
                          <div className="flex items-center justify-between gap-2">
                            <span className="font-semibold text-foreground">
                              {srv.protocol} ({srv.direction})
                            </span>
                            {srv.socketType && <Badge variant="secondary">{srv.socketType}</Badge>}
                          </div>
                          <p className="mt-1 font-mono text-foreground">
                            {srv.hostname}:{srv.port}
                          </p>
                          {srv.authentication.length > 0 && (
                            <p className="mt-0.5 text-muted-foreground">
                              {t('diagnostics.authMethods', 'Auth: {{methods}}', {
                                methods: srv.authentication.join(', '),
                              })}
                            </p>
                          )}
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div className="space-y-2">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-semibold uppercase tracking-wider text-muted-foreground">
                      {t('diagnostics.oidcMetadata', 'OAuth / OIDC Discovery (/api/discover/{{email}})', {
                        email: discovery.email,
                      })}
                    </span>
                    {discovery.oidc && (
                      <CopyButton
                        value={JSON.stringify(discovery.oidc, null, 2)}
                        label={t('diagnostics.copyDiscoveryJson', 'Discovery JSON')}
                        showText
                      />
                    )}
                  </div>

                  {discovery.oidc ? (
                    <dl className="grid grid-cols-1 gap-x-4 gap-y-2 rounded-lg border border-border bg-muted/30 p-3 text-xs sm:grid-cols-2">
                      {(
                        [
                          ['Issuer', discovery.oidc.issuer],
                          ['Authorization', discovery.oidc.authorization_endpoint],
                          ['Token', discovery.oidc.token_endpoint],
                          ['Userinfo', discovery.oidc.userinfo_endpoint],
                          ['JWKS URI', discovery.oidc.jwks_uri],
                          [
                            'Required Scopes',
                            discovery.oidc.stalwart_required_scopes?.join(', ') ??
                              discovery.oidc.scopes_supported?.join(', '),
                          ],
                        ] as const
                      ).map(([label, val]) =>
                        val ? (
                          <div key={label} className="min-w-0">
                            <dt className="font-medium text-muted-foreground">{label}</dt>
                            <dd className="truncate font-mono text-foreground" title={val}>
                              {val}
                            </dd>
                          </div>
                        ) : null,
                      )}
                    </dl>
                  ) : (
                    <p className="text-xs text-destructive" role="alert">
                      {discovery.oidcError ?? t('diagnostics.discoverFailed', 'Failed to query discovery endpoint.')}
                    </p>
                  )}
                </div>
              </div>
            )}
          </CardContent>
        </Card>
      </section>

      {/* Section 3: Prometheus Snapshot */}
      <section className="space-y-3">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <div className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-muted-foreground">
            <Activity className="h-4 w-4" aria-hidden="true" />
            <h2>{t('diagnostics.prometheusSection', 'Prometheus Telemetry Snapshot (/metrics/prometheus)')}</h2>
          </div>
          {prom?.status === 'ok' && (
            <span className="text-xs tabular-nums text-muted-foreground">
              {t('diagnostics.metricCount', '{{shown}} of {{total}} metrics', {
                shown: filteredMetrics.length,
                total: prom.metrics.length,
              })}
            </span>
          )}
        </div>

        <Card>
          <CardContent className="space-y-3 p-4">
            {promLoading && !prom ? (
              <div className="flex items-center gap-2 text-sm text-muted-foreground" role="status">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                {t('diagnostics.loadingMetrics', 'Checking /metrics/prometheus...')}
              </div>
            ) : prom?.status === 'disabled' ? (
              <div className="flex items-start justify-between gap-3 text-sm text-muted-foreground">
                <div className="flex items-start gap-2.5">
                  <Info className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                  <p>
                    {t(
                      'diagnostics.promDisabled',
                      'Prometheus metrics export is not enabled on this server (metrics.prometheus). Enable it in Stalwart config to inspect live SMTP, IMAP, JMAP, queue, and spam counters here.',
                    )}
                  </p>
                </div>
                {metricsSettingsHref && (
                  <Button asChild variant="outline" size="sm" className="shrink-0">
                    <Link to={metricsSettingsHref}>{t('diagnostics.openMetricsSettings', 'Metrics settings')}</Link>
                  </Button>
                )}
              </div>
            ) : prom?.status === 'authRequired' || (!prom && promConfig?.mode === 'unknown') ? (
              <div className="space-y-3">
                <div className="flex flex-wrap items-start justify-between gap-3 text-sm text-muted-foreground">
                  <div className="flex items-start gap-2.5">
                    <Lock className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
                    <div className="space-y-1">
                      <p>
                        {promConfig?.mode === 'basicAuth'
                          ? t(
                              'diagnostics.promAuthRequired',
                              '/metrics/prometheus requires Basic Auth (configured in Settings → Telemetry → Metrics, e.g. STALWART_METRICS_PASSWORD). Enter scrape credentials below to load metrics without triggering a browser popup.',
                            )
                          : t(
                              'diagnostics.promManualCheck',
                              'Prometheus endpoint may require Basic Auth. Enter scrape credentials if enabled, or click Load Metrics directly.',
                            )}
                      </p>
                    </div>
                  </div>
                  {metricsSettingsHref && (
                    <Button asChild variant="outline" size="sm" className="shrink-0">
                      <Link to={metricsSettingsHref}>{t('diagnostics.openMetricsSettings', 'Metrics settings')}</Link>
                    </Button>
                  )}
                </div>
                <form
                  onSubmit={(e) => void handlePrometheusAuthSubmit(e)}
                  className="flex flex-wrap items-center gap-2"
                >
                  <Input
                    value={promUsername}
                    onChange={(e) => setPromUsername(e.target.value)}
                    placeholder={t('diagnostics.promUsernamePlaceholder', 'Username (e.g. prometheus)')}
                    aria-label={t('diagnostics.promUsernameLabel', 'Prometheus username')}
                    className="w-48"
                  />
                  <Input
                    type="password"
                    value={promPassword}
                    onChange={(e) => setPromPassword(e.target.value)}
                    placeholder={t('diagnostics.promPasswordPlaceholder', 'Scrape password')}
                    aria-label={t('diagnostics.promPasswordLabel', 'Prometheus password')}
                    className="min-w-52 flex-1"
                  />
                  <Button
                    type="submit"
                    variant="secondary"
                    disabled={
                      promManualLoading || (promConfig?.mode === 'basicAuth' && (!promUsername.trim() || !promPassword))
                    }
                  >
                    {promManualLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" aria-hidden="true" />}
                    {t('diagnostics.loadMetrics', 'Load Metrics')}
                  </Button>
                </form>
                {promAuthFailed && (
                  <p className="text-xs text-destructive" role="alert">
                    {t('diagnostics.promAuthFailed', 'Invalid Prometheus username or password.')}
                  </p>
                )}
              </div>
            ) : prom?.status === 'error' ? (
              <p className="text-sm text-destructive" role="alert">
                {prom.message}
              </p>
            ) : prom?.status === 'ok' ? (
              <>
                <div className="flex flex-wrap items-center gap-2">
                  <div className="relative min-w-56 flex-1">
                    <Search
                      className="pointer-events-none absolute left-2.5 top-1/2 h-3.5 w-3.5 -translate-y-1/2 text-muted-foreground"
                      aria-hidden="true"
                    />
                    <Input
                      value={promQuery}
                      onChange={(e) => setPromQuery(e.target.value)}
                      placeholder={t('diagnostics.filterMetrics', 'Filter metrics (e.g. smtp, imap, queue, spam)...')}
                      aria-label={t('diagnostics.filterMetricsLabel', 'Filter Prometheus metrics')}
                      className="pl-8"
                    />
                  </div>
                  <button
                    type="button"
                    aria-pressed={hideZeroMetrics}
                    onClick={() => setHideZeroMetrics((v) => !v)}
                    className={cn(
                      'inline-flex h-9 items-center rounded-md border px-3 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                      hideZeroMetrics
                        ? 'border-border bg-highlight text-highlight-foreground'
                        : 'border-border bg-card text-muted-foreground hover:text-foreground',
                    )}
                  >
                    {t('diagnostics.hideZero', 'Non-zero only')}
                  </button>
                </div>

                {filteredMetrics.length === 0 ? (
                  <p className="py-4 text-center text-sm text-muted-foreground">
                    {t('diagnostics.noMatchingMetrics', 'No metrics match the current filter.')}
                  </p>
                ) : (
                  <div className="max-h-96 overflow-auto rounded-lg border border-border">
                    <table className="w-full text-xs">
                      <thead className="sticky top-0 bg-muted text-left text-[11px] uppercase tracking-wider text-muted-foreground">
                        <tr>
                          <th className="px-3 py-2">{t('diagnostics.colMetric', 'Metric')}</th>
                          <th className="px-3 py-2">{t('diagnostics.colType', 'Type')}</th>
                          <th className="px-3 py-2 text-right">{t('diagnostics.colValue', 'Value')}</th>
                        </tr>
                      </thead>
                      <tbody className="divide-y divide-border">
                        {filteredMetrics.map((metric, idx) => (
                          <tr key={`${metric.name}-${metric.labels ?? ''}-${idx}`} className="hover:bg-muted/30">
                            <td className="px-3 py-2">
                              <span className="block font-mono font-medium text-foreground">
                                {metric.name}
                                {metric.labels ? `{${metric.labels}}` : ''}
                              </span>
                              {metric.help && <span className="block text-muted-foreground">{metric.help}</span>}
                            </td>
                            <td className="px-3 py-2">
                              <Badge variant="outline" className="text-[10px]">
                                {metric.type}
                              </Badge>
                            </td>
                            <td className="px-3 py-2 text-right font-mono font-medium tabular-nums text-foreground">
                              {formatNumber(metric.value)}
                            </td>
                          </tr>
                        ))}
                      </tbody>
                    </table>
                  </div>
                )}
              </>
            ) : null}
          </CardContent>
        </Card>
      </section>
    </div>
  );
}

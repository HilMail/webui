/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { resolveObject } from '@/lib/schemaResolver';
import { getApiBaseUrl } from '@/services/api';
import type { DiscoveryResponse } from '@/services/auth/oauth';
import { jmapGetOne } from '@/services/jmap/client';
import type { Schema } from '@/types/schema';

export type PrometheusConfigInfo =
  | { mode: 'disabled' }
  | { mode: 'open' }
  | { mode: 'basicAuth'; username: string }
  | { mode: 'unknown' };

export interface EndpointHealth {
  ok: boolean;
  status: number;
  elapsedMs: number;
  error?: string;
}

export interface HealthSnapshot {
  live: EndpointHealth;
  ready: EndpointHealth;
  checkedAt: number;
}

export interface MailServerEndpoint {
  direction: 'incoming' | 'outgoing';
  protocol: string;
  hostname: string;
  port: string;
  socketType: string;
  authentication: string[];
}

export interface ExtendedDiscoveryResponse extends DiscoveryResponse {
  issuer?: string;
  userinfo_endpoint?: string;
  jwks_uri?: string;
  registration_endpoint?: string;
  device_authorization_endpoint?: string;
  revocation_endpoint?: string;
  grant_types_supported?: string[];
  [key: string]: unknown;
}

export interface EmailDiscoveryResult {
  email: string;
  oidc: ExtendedDiscoveryResponse | null;
  oidcError?: string;
  mailServers: MailServerEndpoint[];
  autoconfigAvailable: boolean;
}

export interface PrometheusMetric {
  name: string;
  type: 'counter' | 'gauge' | 'histogram' | 'untyped';
  help: string;
  value: number;
  labels?: string;
}

export type PrometheusSnapshotResult =
  | { status: 'ok'; metrics: PrometheusMetric[]; rawLines: number }
  | { status: 'disabled' }
  | { status: 'authRequired' }
  | { status: 'error'; message: string };

async function probeEndpoint(path: string, signal?: AbortSignal): Promise<EndpointHealth> {
  const started = performance.now();
  try {
    const response = await fetch(`${getApiBaseUrl()}${path}`, { signal, cache: 'no-store' });
    return {
      ok: response.ok,
      status: response.status,
      elapsedMs: Math.max(1, Math.round(performance.now() - started)),
    };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return {
      ok: false,
      status: 0,
      elapsedMs: Math.max(1, Math.round(performance.now() - started)),
      error: err instanceof Error ? err.message : String(err),
    };
  }
}

/** Checks Stalwart's HTTP liveness and data-store readiness probes in parallel. */
export async function fetchHealthStatus(signal?: AbortSignal): Promise<HealthSnapshot> {
  const [live, ready] = await Promise.all([probeEndpoint('/healthz/live', signal), probeEndpoint('/healthz/ready', signal)]);
  return { live, ready, checkedAt: Date.now() };
}

/** Extracts incoming/outgoing mail server specs from Mozilla Thunderbird autoconfig XML. */
export function parseAutoconfigXml(xml: string): MailServerEndpoint[] {
  if (!xml.trim()) return [];
  const doc = new DOMParser().parseFromString(xml, 'application/xml');
  if (doc.querySelector('parsererror')) return [];

  const endpoints: MailServerEndpoint[] = [];
  for (const tag of ['incomingServer', 'outgoingServer'] as const) {
    const direction = tag === 'incomingServer' ? 'incoming' : 'outgoing';
    for (const node of Array.from(doc.querySelectorAll(tag))) {
      const protocol = (node.getAttribute('type') ?? '').toUpperCase() || tag;
      const hostname = node.querySelector('hostname')?.textContent?.trim() ?? '';
      const port = node.querySelector('port')?.textContent?.trim() ?? '';
      const socketType = node.querySelector('socketType')?.textContent?.trim() ?? '';
      const authentication = Array.from(node.querySelectorAll('authentication'))
        .map((el) => el.textContent?.trim() ?? '')
        .filter(Boolean);
      if (hostname || port) {
        endpoints.push({ direction, protocol, hostname, port, socketType, authentication });
      }
    }
  }
  return endpoints;
}

/**
 * Queries both Stalwart's `/api/discover/<email>` OIDC/OAuth discovery endpoint and
 * the Mozilla autoconfig XML endpoint so admins can verify client login and mail server ports together.
 */
export async function fetchEmailDiscovery(email: string, signal?: AbortSignal): Promise<EmailDiscoveryResult> {
  const trimmed = email.trim();
  const base = getApiBaseUrl();

  const [oidcOutcome, autoconfigOutcome] = await Promise.all([
    (async (): Promise<{ data: ExtendedDiscoveryResponse | null; error?: string }> => {
      try {
        const res = await fetch(`${base}/api/discover/${encodeURIComponent(trimmed)}`, { signal });
        if (!res.ok) {
          return { data: null, error: `${res.status} ${res.statusText}`.trim() };
        }
        return { data: (await res.json()) as ExtendedDiscoveryResponse };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        return { data: null, error: err instanceof Error ? err.message : String(err) };
      }
    })(),
    (async (): Promise<{ servers: MailServerEndpoint[]; available: boolean }> => {
      try {
        const res = await fetch(
          `${base}/.well-known/autoconfig/mail/config-v1.1.xml?emailaddress=${encodeURIComponent(trimmed)}`,
          { signal },
        );
        if (!res.ok) return { servers: [], available: false };
        const servers = parseAutoconfigXml(await res.text());
        return { servers, available: servers.length > 0 };
      } catch (err) {
        if (err instanceof DOMException && err.name === 'AbortError') throw err;
        return { servers: [], available: false };
      }
    })(),
  ]);

  return {
    email: trimmed,
    oidc: oidcOutcome.data,
    oidcError: oidcOutcome.error,
    mailServers: autoconfigOutcome.servers,
    autoconfigAvailable: autoconfigOutcome.available,
  };
}

/**
 * Parses Prometheus/OpenMetrics text exposition into flat metrics.
 * Collapses histogram `_bucket` lines so summary views focus on counters, gauges, and histogram totals.
 */
export function parsePrometheusMetrics(raw: string): PrometheusMetric[] {
  const helpByFamily = new Map<string, string>();
  const typeByFamily = new Map<string, PrometheusMetric['type']>();
  const metrics: PrometheusMetric[] = [];

  for (const rawLine of raw.split('\n')) {
    const line = rawLine.trim();
    if (!line || line === '# EOF') continue;

    if (line.startsWith('# HELP ')) {
      const rest = line.slice(7);
      const spaceIdx = rest.indexOf(' ');
      if (spaceIdx > 0) helpByFamily.set(rest.slice(0, spaceIdx), rest.slice(spaceIdx + 1).trim());
      continue;
    }

    if (line.startsWith('# TYPE ')) {
      const rest = line.slice(7);
      const spaceIdx = rest.indexOf(' ');
      if (spaceIdx > 0) {
        const rawType = rest.slice(spaceIdx + 1).trim();
        const type: PrometheusMetric['type'] =
          rawType === 'counter' || rawType === 'gauge' || rawType === 'histogram' ? rawType : 'untyped';
        typeByFamily.set(rest.slice(0, spaceIdx), type);
      }
      continue;
    }

    if (line.startsWith('#')) continue;

    const match = line.match(/^([a-zA-Z_:][a-zA-Z0-9_:]*)(?:\{([^}]*)\})?\s+([^\s]+)/);
    if (!match) continue;
    const [, name, labels, valueStr] = match;
    if (name.endsWith('_bucket')) continue;

    const value = Number(valueStr);
    if (!Number.isFinite(value)) continue;

    const family = name.replace(/_(count|sum|total)$/, '');
    const type = typeByFamily.get(name) ?? typeByFamily.get(family) ?? 'untyped';
    const help = helpByFamily.get(name) ?? helpByFamily.get(family) ?? '';

    metrics.push({
      name,
      type,
      help,
      value,
      ...(labels ? { labels } : {}),
    });
  }

  return metrics;
}

function encodeBasicAuth(username: string, password: string): string {
  const bytes = new TextEncoder().encode(`${username}:${password}`);
  let binary = '';
  for (const byte of bytes) binary += String.fromCharCode(byte);
  return `Basic ${btoa(binary)}`;
}

/**
 * Inspects Stalwart's `x:Metrics` singleton via JMAP so the UI knows whether `/metrics/prometheus`
 * is disabled, anonymous, or Basic-Auth protected before making an HTTP request that triggers a browser auth modal.
 */
export async function fetchPrometheusConfig(
  schema: Schema | null,
  canGet: (prefix: string) => boolean,
  signal?: AbortSignal,
): Promise<PrometheusConfigInfo> {
  if (!schema) return { mode: 'unknown' };
  const resolved = resolveObject(schema, 'x:Metrics');
  if (!resolved || !canGet(resolved.permissionPrefix)) return { mode: 'unknown' };

  try {
    const record = await jmapGetOne(resolved.objectName, 'singleton', ['prometheus'], { signal });
    const prom = record?.prometheus as Record<string, unknown> | undefined;
    if (!prom || typeof prom !== 'object') return { mode: 'unknown' };
    if (prom['@type'] === 'Disabled') return { mode: 'disabled' };
    if (prom['@type'] === 'Enabled') {
      const username = typeof prom.authUsername === 'string' ? prom.authUsername.trim() : '';
      const hasSecret = prom.authSecret != null && prom.authSecret !== '';
      if (username || hasSecret) {
        return { mode: 'basicAuth', username };
      }
      return { mode: 'open' };
    }
    return { mode: 'unknown' };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return { mode: 'unknown' };
  }
}

export interface FetchPrometheusOptions {
  signal?: AbortSignal;
  credentials?: { username: string; password: string };
}

export interface PrometheusCredentials {
  username: string;
  password: string;
}

const PROMETHEUS_CREDS_STORAGE_KEY = 'stalwart-prometheus-creds';

/** Reads saved Prometheus Basic Auth credentials scoped by API origin so reloads skip re-prompting. */
export function loadSavedPrometheusCredentials(): PrometheusCredentials | null {
  try {
    const raw = localStorage.getItem(PROMETHEUS_CREDS_STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    const entry = parsed[getApiBaseUrl()];
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return null;
    const obj = entry as Record<string, unknown>;
    if (typeof obj.username === 'string' && typeof obj.password === 'string' && obj.username && obj.password) {
      return { username: obj.username, password: obj.password };
    }
    return null;
  } catch {
    return null;
  }
}

export function savePrometheusCredentials(credentials: PrometheusCredentials): void {
  try {
    const raw = localStorage.getItem(PROMETHEUS_CREDS_STORAGE_KEY);
    const parsed = raw ? (JSON.parse(raw) as Record<string, unknown>) : {};
    const next = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {};
    next[getApiBaseUrl()] = { username: credentials.username, password: credentials.password };
    localStorage.setItem(PROMETHEUS_CREDS_STORAGE_KEY, JSON.stringify(next));
  } catch {
    // Ignore storage errors (e.g. restricted/private browser contexts).
  }
}

export function clearSavedPrometheusCredentials(): void {
  try {
    const raw = localStorage.getItem(PROMETHEUS_CREDS_STORAGE_KEY);
    if (!raw) return;
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
      localStorage.removeItem(PROMETHEUS_CREDS_STORAGE_KEY);
      return;
    }
    delete parsed[getApiBaseUrl()];
    if (Object.keys(parsed).length === 0) {
      localStorage.removeItem(PROMETHEUS_CREDS_STORAGE_KEY);
    } else {
      localStorage.setItem(PROMETHEUS_CREDS_STORAGE_KEY, JSON.stringify(parsed));
    }
  } catch {
    // Ignore storage errors cleanly.
  }
}

/** Fetches and parses Stalwart's Community-accessible `/metrics/prometheus` exposition endpoint. */
export async function fetchPrometheusSnapshot(options: FetchPrometheusOptions = {}): Promise<PrometheusSnapshotResult> {
  const { signal, credentials } = options;
  try {
    const headers: Record<string, string> = { Accept: 'text/plain; version=0.0.4, */*' };
    if (credentials) {
      headers.Authorization = encodeBasicAuth(credentials.username, credentials.password);
    }
    const res = await fetch(`${getApiBaseUrl()}/metrics/prometheus`, {
      signal,
      cache: 'no-store',
      credentials: 'omit',
      headers,
    });
    if (res.status === 404) return { status: 'disabled' };
    if (res.status === 401 || res.status === 403) return { status: 'authRequired' };
    if (!res.ok) return { status: 'error', message: `${res.status} ${res.statusText}`.trim() };

    const text = await res.text();
    const metrics = parsePrometheusMetrics(text);
    return { status: 'ok', metrics, rawLines: text.split('\n').length };
  } catch (err) {
    if (err instanceof DOMException && err.name === 'AbortError') throw err;
    return { status: 'error', message: err instanceof Error ? err.message : String(err) };
  }
}

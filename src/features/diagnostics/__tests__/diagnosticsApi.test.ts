/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { afterEach, describe, expect, it, vi } from 'vitest';

import {
  fetchEmailDiscovery,
  fetchHealthStatus,
  fetchPrometheusConfig,
  fetchPrometheusSnapshot,
  parseAutoconfigXml,
  parsePrometheusMetrics,
} from '@/features/diagnostics/diagnosticsApi';
import * as jmapClient from '@/services/jmap/client';
import type { Schema } from '@/types/schema';

describe('diagnosticsApi', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('probes /healthz/live and /healthz/ready cleanly', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.endsWith('/healthz/live')) return new Response(null, { status: 200 });
      return new Response(null, { status: 503 });
    });

    const health = await fetchHealthStatus();
    expect(health.live.ok).toBe(true);
    expect(health.live.status).toBe(200);
    expect(health.ready.ok).toBe(false);
    expect(health.ready.status).toBe(503);
  });

  it('parses incoming and outgoing mail servers from autoconfig XML', () => {
    const xml = `<?xml version="1.0" encoding="UTF-8"?>
      <clientConfig version="1.1">
        <emailProvider id="hilmail.co">
          <incomingServer type="imap">
            <hostname>mail.hilmail.co</hostname>
            <port>993</port>
            <socketType>SSL</socketType>
            <authentication>OAuth2</authentication>
            <authentication>password-cleartext</authentication>
          </incomingServer>
          <outgoingServer type="smtp">
            <hostname>mail.hilmail.co</hostname>
            <port>465</port>
            <socketType>SSL</socketType>
            <authentication>OAuth2</authentication>
          </outgoingServer>
        </emailProvider>
      </clientConfig>`;

    expect(parseAutoconfigXml(xml)).toEqual([
      {
        direction: 'incoming',
        protocol: 'IMAP',
        hostname: 'mail.hilmail.co',
        port: '993',
        socketType: 'SSL',
        authentication: ['OAuth2', 'password-cleartext'],
      },
      {
        direction: 'outgoing',
        protocol: 'SMTP',
        hostname: 'mail.hilmail.co',
        port: '465',
        socketType: 'SSL',
        authentication: ['OAuth2'],
      },
    ]);
  });

  it('fetches /api/discover/<email> and autoconfig endpoints together', async () => {
    vi.spyOn(globalThis, 'fetch').mockImplementation(async (input) => {
      const url = String(input);
      if (url.includes('/api/discover/')) {
        return new Response(
          JSON.stringify({
            issuer: 'https://mail.hilmail.co',
            authorization_endpoint: 'https://mail.hilmail.co/login',
            token_endpoint: 'https://mail.hilmail.co/auth/token',
            stalwart_required_scopes: ['openid'],
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }
      return new Response('', { status: 404 });
    });

    const result = await fetchEmailDiscovery('alice@hilmail.co');
    expect(result.oidc?.issuer).toBe('https://mail.hilmail.co');
    expect(result.oidc?.token_endpoint).toBe('https://mail.hilmail.co/auth/token');
    expect(result.autoconfigAvailable).toBe(false);
    expect(result.mailServers).toEqual([]);
  });

  it('parses Prometheus counters/gauges while collapsing _bucket noise and handling disabled/auth responses', async () => {
    const rawProm = [
      '# HELP smtp_connections_total Active SMTP connections',
      '# TYPE smtp_connections_total counter',
      'smtp_connections_total 42',
      '# HELP queue_size_bytes Queued bytes',
      '# TYPE queue_size_bytes gauge',
      'queue_size_bytes 1024',
      'http_duration_ms_bucket{le="10"} 5',
      'http_duration_ms_count 5',
    ].join('\n');

    const parsed = parsePrometheusMetrics(rawProm);
    expect(parsed).toEqual([
      {
        name: 'smtp_connections_total',
        type: 'counter',
        help: 'Active SMTP connections',
        value: 42,
      },
      {
        name: 'queue_size_bytes',
        type: 'gauge',
        help: 'Queued bytes',
        value: 1024,
      },
      {
        name: 'http_duration_ms_count',
        type: 'untyped',
        help: '',
        value: 5,
      },
    ]);

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 404 }));
    expect(await fetchPrometheusSnapshot()).toEqual({ status: 'disabled' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(null, { status: 401 }));
    expect(await fetchPrometheusSnapshot()).toEqual({ status: 'authRequired' });

    vi.spyOn(globalThis, 'fetch').mockResolvedValueOnce(new Response(rawProm, { status: 200 }));
    const ok = await fetchPrometheusSnapshot({ credentials: { username: 'prometheus', password: 'secret' } });
    expect(ok.status).toBe('ok');
    if (ok.status === 'ok') {
      expect(ok.metrics).toHaveLength(3);
    }
  });

  it('reads x:Metrics prometheus auth mode via JMAP before scraping', async () => {
    const schema = {
      objects: {
        'x:Metrics': { type: 'singleton', description: 'Metrics', permissionPrefix: 'metrics' },
      },
      schemas: {},
      fields: {},
      forms: {},
      lists: {},
      enums: {},
      dashboards: [],
      layouts: [],
    } as unknown as Schema;

    vi.spyOn(jmapClient, 'jmapGetOne').mockResolvedValueOnce({
      id: 'singleton',
      prometheus: { '@type': 'Enabled', authUsername: 'prometheus', authSecret: '******' },
    });
    expect(await fetchPrometheusConfig(schema, () => true)).toEqual({
      mode: 'basicAuth',
      username: 'prometheus',
    });

    vi.spyOn(jmapClient, 'jmapGetOne').mockResolvedValueOnce({
      id: 'singleton',
      prometheus: { '@type': 'Disabled' },
    });
    expect(await fetchPrometheusConfig(schema, () => true)).toEqual({ mode: 'disabled' });
    expect(await fetchPrometheusConfig(schema, () => false)).toEqual({ mode: 'unknown' });
  });
});

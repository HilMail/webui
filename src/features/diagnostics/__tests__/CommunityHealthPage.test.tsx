/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityHealthPage } from '@/features/diagnostics/CommunityHealthPage';
import * as diagnosticsApi from '@/features/diagnostics/diagnosticsApi';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

function createDiagnosticsSchema(): Schema {
  return {
    objects: {
      'x:Metrics': { type: 'singleton', description: 'Metrics', permissionPrefix: 'metrics' },
    },
    schemas: {},
    fields: {},
    forms: {},
    lists: {},
    enums: {},
    dashboards: [],
    layouts: [
      {
        name: 'Settings',
        icon: 'settings',
        items: [{ link: { name: 'Metrics', icon: 'gauge', viewName: 'x:Metrics' } }],
      },
    ],
  };
}

function renderPage() {
  return render(
    <MemoryRouter>
      <CommunityHealthPage />
    </MemoryRouter>,
  );
}

describe('CommunityHealthPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSchemaStore.getState().setSchema(createDiagnosticsSchema());
    useAccountStore.getState().setAccountInfo(['metricsGet'], 'community', 'en-US');
    useAuthStore.setState({
      accounts: {
        a1: {
          name: 'admin@hilmail.co',
          isPersonal: false,
          hasManagement: true,
        },
      },
      activeAccountId: 'a1',
    });
  });

  it('auto-loads Prometheus metrics when open and filters health/autodiscover cleanly', async () => {
    vi.spyOn(diagnosticsApi, 'fetchHealthStatus').mockResolvedValue({
      live: { ok: true, status: 200, elapsedMs: 4 },
      ready: { ok: false, status: 503, elapsedMs: 9 },
      checkedAt: Date.now(),
    });
    vi.spyOn(diagnosticsApi, 'fetchEmailDiscovery').mockResolvedValue({
      email: 'admin@hilmail.co',
      oidc: {
        issuer: 'https://mail.hilmail.co',
        authorization_endpoint: 'https://mail.hilmail.co/login',
        token_endpoint: 'https://mail.hilmail.co/auth/token',
      },
      mailServers: [
        {
          direction: 'incoming',
          protocol: 'IMAP',
          hostname: 'mail.hilmail.co',
          port: '993',
          socketType: 'SSL',
          authentication: ['OAuth2'],
        },
      ],
      autoconfigAvailable: true,
    });
    vi.spyOn(diagnosticsApi, 'fetchPrometheusConfig').mockResolvedValue({ mode: 'open' });
    vi.spyOn(diagnosticsApi, 'fetchPrometheusSnapshot').mockResolvedValue({
      status: 'ok',
      rawLines: 2,
      metrics: [
        { name: 'smtp_connections_total', type: 'counter', help: 'SMTP connections', value: 18 },
        { name: 'imap_connections_total', type: 'counter', help: 'IMAP connections', value: 0 },
      ],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText('mail.hilmail.co:993')).toBeInTheDocument();
    expect(screen.getByText('https://mail.hilmail.co/auth/token')).toBeInTheDocument();
    expect(screen.getByText('smtp_connections_total')).toBeInTheDocument();
    expect(screen.queryByText('imap_connections_total')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Non-zero only' }));
    expect(screen.getByText('imap_connections_total')).toBeInTheDocument();

    const emailInput = screen.getByLabelText('Account email for discovery');
    fireEvent.change(emailInput, { target: { value: 'bob@hilmail.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check Discovery' }));
    await waitFor(() => {
      expect(diagnosticsApi.fetchEmailDiscovery).toHaveBeenLastCalledWith('bob@hilmail.co');
    });
  });

  it('skips auto-fetching /metrics/prometheus when Basic Auth is configured and loads on manual submit', async () => {
    vi.spyOn(diagnosticsApi, 'fetchHealthStatus').mockResolvedValue({
      live: { ok: true, status: 200, elapsedMs: 2 },
      ready: { ok: true, status: 200, elapsedMs: 3 },
      checkedAt: Date.now(),
    });
    vi.spyOn(diagnosticsApi, 'fetchEmailDiscovery').mockResolvedValue({
      email: 'admin@hilmail.co',
      oidc: {
        authorization_endpoint: 'https://mail.hilmail.co/login',
        token_endpoint: 'https://mail.hilmail.co/auth/token',
      },
      mailServers: [],
      autoconfigAvailable: false,
    });
    vi.spyOn(diagnosticsApi, 'fetchPrometheusConfig').mockResolvedValue({
      mode: 'basicAuth',
      username: 'prometheus',
    });
    const promSpy = vi.spyOn(diagnosticsApi, 'fetchPrometheusSnapshot').mockResolvedValue({
      status: 'ok',
      rawLines: 1,
      metrics: [{ name: 'queue_messages', type: 'gauge', help: 'Queued count', value: 5 }],
    });

    renderPage();

    await waitFor(() => {
      expect(screen.getByLabelText('Prometheus username')).toHaveValue('prometheus');
    });
    // Must not auto-fetch on mount so the browser never pops up a native Basic Auth dialog.
    expect(promSpy).not.toHaveBeenCalled();
    expect(screen.getByRole('link', { name: 'Metrics settings' })).toHaveAttribute(
      'href',
      '/Settings/x:Metrics/singleton',
    );

    fireEvent.change(screen.getByLabelText('Prometheus password'), { target: { value: 'scrape-pass' } });
    fireEvent.click(screen.getByRole('button', { name: 'Load Metrics' }));

    await waitFor(() => {
      expect(promSpy).toHaveBeenCalledWith({
        credentials: { username: 'prometheus', password: 'scrape-pass' },
      });
      expect(screen.getByText('queue_messages')).toBeInTheDocument();
    });
  });
});

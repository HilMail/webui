/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { CommunityHealthPage } from '@/features/diagnostics/CommunityHealthPage';
import * as diagnosticsApi from '@/features/diagnostics/diagnosticsApi';
import { useAuthStore } from '@/stores/authStore';

describe('CommunityHealthPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
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

  it('renders health probes, autodiscover output, and filterable Prometheus metrics', async () => {
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
    vi.spyOn(diagnosticsApi, 'fetchPrometheusSnapshot').mockResolvedValue({
      status: 'ok',
      rawLines: 2,
      metrics: [
        { name: 'smtp_connections_total', type: 'counter', help: 'SMTP connections', value: 18 },
        { name: 'imap_connections_total', type: 'counter', help: 'IMAP connections', value: 0 },
      ],
    });

    render(<CommunityHealthPage />);

    await waitFor(() => {
      expect(screen.getByText('Healthy')).toBeInTheDocument();
      expect(screen.getByText('Unavailable')).toBeInTheDocument();
    });

    expect(screen.getByText('mail.hilmail.co:993')).toBeInTheDocument();
    expect(screen.getByText('https://mail.hilmail.co/auth/token')).toBeInTheDocument();

    // Non-zero filter is enabled by default so idle zero counters are hidden until toggled off.
    expect(screen.getByText('smtp_connections_total')).toBeInTheDocument();
    expect(screen.queryByText('imap_connections_total')).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole('button', { name: 'Non-zero only' }));
    expect(screen.getByText('imap_connections_total')).toBeInTheDocument();

    // Re-running discovery submits the updated account address cleanly.
    const emailInput = screen.getByLabelText('Account email for discovery');
    fireEvent.change(emailInput, { target: { value: 'bob@hilmail.co' } });
    fireEvent.click(screen.getByRole('button', { name: 'Check Discovery' }));
    await waitFor(() => {
      expect(diagnosticsApi.fetchEmailDiscovery).toHaveBeenLastCalledWith('bob@hilmail.co');
    });
  });

  it('shows setup guidance when /metrics/prometheus is disabled on the server', async () => {
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
    vi.spyOn(diagnosticsApi, 'fetchPrometheusSnapshot').mockResolvedValue({ status: 'disabled' });

    render(<CommunityHealthPage />);

    await waitFor(() => {
      expect(screen.getByText(/Prometheus metrics export is not enabled/i)).toBeInTheDocument();
    });
  });
});

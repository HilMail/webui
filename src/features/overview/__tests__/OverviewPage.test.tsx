/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OverviewPage } from '@/features/overview/OverviewPage';
import * as fetchTotals from '@/features/overview/fetchTotals';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

function createOverviewSchema(): Schema {
  return {
    objects: {
      'x:Account': { type: 'object', description: 'Account', permissionPrefix: 'account' },
      'x:Account/User': { type: 'view', objectName: 'x:Account' },
      'x:Domain': { type: 'object', description: 'Domain', permissionPrefix: 'domain' },
      'x:Certificate': { type: 'object', description: 'Certificate', permissionPrefix: 'cert' },
      'x:QueuedMessage': { type: 'object', description: 'Queue', permissionPrefix: 'queue' },
      'x:DmarcExternalReport': { type: 'object', description: 'DMARC', permissionPrefix: 'dmarc' },
    },
    schemas: {},
    fields: {},
    forms: {},
    lists: {},
    enums: {},
    dashboards: [],
    layouts: [
      {
        name: 'Management',
        icon: 'monitor',
        items: [
          { link: { name: 'Users', icon: 'users', viewName: 'x:Account/User' } },
          { link: { name: 'Domains', icon: 'globe', viewName: 'x:Domain' } },
          { link: { name: 'Certificates', icon: 'lock', viewName: 'x:Certificate' } },
          { link: { name: 'Queue', icon: 'mail', viewName: 'x:QueuedMessage' } },
          { link: { name: 'DMARC', icon: 'shield-check', viewName: 'x:DmarcExternalReport' } },
        ],
      },
    ],
  };
}

describe('OverviewPage', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    useSchemaStore.getState().setSchema(createOverviewSchema());
    useAccountStore
      .getState()
      .setAccountInfo(['accountQuery', 'domainQuery', 'certQuery', 'queueQuery', 'dmarcQuery'], 'community', 'en-US');
  });

  it('renders grouped totals, certificate validity breakdown, queue alert, and report issues', async () => {
    vi.spyOn(fetchTotals, 'fetchCardTotals').mockResolvedValue({
      users: { status: 'ok', total: 19885 },
      domains: { status: 'ok', total: 4 },
      certificates: { status: 'ok', total: 3, valid: 2, expired: 1, expiringSoon: 1 },
      queuedMessages: { status: 'ok', total: 7 },
      dmarcExternal: { status: 'ok', total: 15, problemCount: 2, sampleSize: 15 },
    });

    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>,
    );

    await waitFor(() => {
      expect(screen.getByText('19,885')).toBeInTheDocument();
    });

    expect(screen.getByText('2 valid · 1 expired · 1 expiring soon')).toBeInTheDocument();
    expect(screen.getByText('Messages waiting in the queue')).toBeInTheDocument();
    expect(screen.getByText('2 with issues in latest 15')).toBeInTheDocument();
    expect(screen.getByText('Attention')).toBeInTheDocument();
    expect(screen.getAllByText('Needs attention')).toHaveLength(2);
    expect(screen.getByRole('link', { name: /Users/i })).toHaveAttribute('href', '/Management/x:Account/User');
  });

  it('shows permission fallback when no overview objects are queryable', () => {
    useAccountStore.getState().setAccountInfo([], 'community', 'en-US');

    render(
      <MemoryRouter>
        <OverviewPage />
      </MemoryRouter>,
    );

    expect(screen.getByText('No inventory objects are available with your current permissions.')).toBeInTheDocument();
  });
});

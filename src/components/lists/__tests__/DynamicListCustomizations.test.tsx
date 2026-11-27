/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DynamicList } from '@/components/lists/DynamicList';
import { withAccountListColumns } from '@/lib/accountColumns';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

let directoryIds: string[] = [];
let mockRows: Record<string, unknown>[] = [];

vi.mock('@/data/objects', () => ({
  useJmapList: (objectName: string | null) => {
    if (objectName === 'x:Directory') {
      return {
        data: { ids: directoryIds, list: directoryIds.map((id) => ({ id })), total: directoryIds.length, position: 0 },
        isPending: false,
        isFetching: false,
        fetchStatus: 'idle',
        isSuccess: true,
        isPlaceholderData: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    return {
      data: { ids: mockRows.map((r) => String(r.id)), list: mockRows, total: mockRows.length, position: 0 },
      isPending: false,
      isFetching: false,
      fetchStatus: 'idle',
      isSuccess: true,
      isPlaceholderData: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

vi.mock('@/data/listAll', () => ({
  useJmapListAll: () => ({
    data: mockRows,
    isPending: false,
    isFetching: false,
    fetchStatus: 'idle',
    isSuccess: true,
    isPlaceholderData: false,
    isError: false,
    error: null,
    refetch: vi.fn(),
  }),
}));

vi.mock('@/data/mutations', () => ({
  useJmapSet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  useJmapBulkSet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  invalidateObjectType: vi.fn(),
}));

function makeTestSchema(): Schema {
  return withAccountListColumns({
    objects: {
      'x:Account': { type: 'object', description: 'Account', permissionPrefix: 'account' },
      'x:Account/User': { type: 'view', objectName: 'x:Account' },
      'x:QueuedMessage': { type: 'object', description: 'Queued Message', permissionPrefix: 'queue' },
      'x:Log': { type: 'object', description: 'Log', permissionPrefix: 'log' },
    },
    schemas: {
      'x:Account': { type: 'single', schemaName: 'UserAccountFields' },
      'x:QueuedMessage': { type: 'single', schemaName: 'QueuedMessageFields' },
    },
    fields: {
      UserAccountFields: {
        properties: {
          name: { description: 'Username', type: { type: 'string', format: 'string' }, update: 'mutable' },
        },
      },
      QueuedMessageFields: {
        properties: {
          returnPath: { description: 'Sender', type: { type: 'string', format: 'emailAddress' }, update: 'serverSet' },
        },
      },
    },
    forms: {},
    lists: {
      'x:Account/User': {
        title: 'Users',
        subtitle: '',
        singularName: 'User',
        pluralName: 'Users',
        columns: [{ name: 'name', label: 'Username' }],
        labelProperty: 'name',
        itemActions: [
          { type: 'setProperty', label: 'Disable', properties: { enable: false } },
          { type: 'delete', label: 'Delete' },
        ],
        massActions: [{ type: 'setProperty', label: 'Disable', properties: { enable: false } }],
      },
      'x:QueuedMessage': {
        title: 'Queue',
        subtitle: '',
        singularName: 'Message',
        pluralName: 'Messages',
        columns: [{ name: 'returnPath', label: 'Sender' }],
        labelProperty: 'returnPath',
        itemActions: [{ type: 'delete', label: 'Abort' }],
      },
    },
    enums: {},
    dashboards: [],
    layouts: [
      {
        name: 'directory',
        icon: 'users',
        items: [{ link: { name: 'Users', icon: 'users', viewName: 'x:Account/User' } }],
      },
      {
        name: 'troubleshoot',
        icon: 'activity',
        items: [
          { link: { name: 'Queue', icon: 'mail', viewName: 'x:QueuedMessage' } },
          { link: { name: 'Logs', icon: 'file-text', viewName: 'x:Log' } },
          { link: { name: 'Live Delivery', icon: 'activity', viewName: 'CustomComponent/LiveDelivery' } },
        ],
      },
    ],
  });
}

function renderList(viewName: string) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <MemoryRouter>
        <DynamicList viewName={viewName} />
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DynamicList fork customizations', () => {
  beforeEach(() => {
    directoryIds = [];
    mockRows = [];
    useSchemaStore.getState().setSchema(makeTestSchema());
    useAccountStore
      .getState()
      .setAccountInfo(
        [
          'accountGet',
          'accountQuery',
          'accountCreate',
          'accountUpdate',
          'accountDestroy',
          'queueGet',
          'queueQuery',
          'queueDestroy',
          'logGet',
          'liveDeliveryTest',
        ],
        'community',
        'en-US',
      );
  });

  it('hides user creation and deletion when an external directory is configured while keeping quota chips', () => {
    directoryIds = ['sql-dir'];
    mockRows = [{ id: 'u1', name: 'alice', usedDiskQuota: 90, quotas: { maxDiskQuota: 100 }, aliases: {} }];

    renderList('x:Account/User');

    expect(screen.getByText('Managed by external directory')).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Create User' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Near Quota (≥80%)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Over Quota (≥100%)' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Negative Counter' })).toBeInTheDocument();

    // Open row actions dropdown with pointerDown/keyDown and verify Delete was stripped for external accounts.
    const actionsBtn = screen.getByRole('button', { name: 'Actions for alice' });
    fireEvent.keyDown(actionsBtn, { key: 'Enter' });
    expect(screen.getByText('Disable')).toBeInTheDocument();
    expect(screen.queryByText('Delete')).not.toBeInTheDocument();
  });

  it('shows Create User when no external directory exists', () => {
    directoryIds = [];
    mockRows = [{ id: 'u1', name: 'alice', usedDiskQuota: 0, quotas: {}, aliases: {} }];

    renderList('x:Account/User');

    expect(screen.queryByText('Managed by external directory')).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Create User' })).toBeInTheDocument();
  });

  it('adds Delivery Trace and Log Entries jumps to x:QueuedMessage row actions', () => {
    mockRows = [
      {
        id: 'q1',
        returnPath: 'sender@hilmail.co',
        recipients: { 'rcpt@example.com': {} },
      },
    ];

    renderList('x:QueuedMessage');

    const actionsBtn = screen.getByRole('button', { name: 'Actions for sender@hilmail.co' });
    fireEvent.keyDown(actionsBtn, { key: 'Enter' });

    const traceLink = screen.getByRole('menuitem', { name: 'Trace delivery: rcpt@example.com' });
    const logsLink = screen.getByRole('menuitem', { name: 'View logs: sender@hilmail.co' });
    expect(traceLink).toHaveAttribute('href', '/troubleshoot/CustomComponent/LiveDelivery?target=rcpt%40example.com');
    expect(logsLink).toHaveAttribute('href', '/troubleshoot/x:Log?f.text=sender%40hilmail.co');
  });
});

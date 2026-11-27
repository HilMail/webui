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
import { TooltipProvider } from '@/components/ui/tooltip';
import { withAccountListColumns } from '@/lib/accountColumns';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import { useUIStore } from '@/stores/uiStore';
import type { Schema } from '@/types/schema';

let directoryIds: string[] = [];
let mockRows: Record<string, unknown>[] = [];
let mockAllError: Error | null = null;
const serverListCache = new Map<
  string,
  { ids: string[]; list: Record<string, unknown>[]; total: number; position: number }
>();

vi.mock('@/data/objects', () => ({
  useJmapList: (objectName: string | null, params?: unknown, options?: { enabled?: boolean }) => {
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
    const cacheKey = `${objectName}:${JSON.stringify(params ?? {})}`;
    if (options?.enabled !== false && objectName) {
      serverListCache.set(cacheKey, {
        ids: mockRows.map((r) => String(r.id)),
        list: mockRows,
        total: mockRows.length,
        position: 0,
      });
    }
    const cached = serverListCache.get(cacheKey);
    return {
      data: cached,
      isPending: !cached && options?.enabled !== false,
      isFetching: false,
      fetchStatus: 'idle',
      isSuccess: !!cached,
      isPlaceholderData: false,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

vi.mock('@/data/listAll', () => ({
  useJmapListAll: (objectName: string | null) => {
    if (!objectName) {
      return {
        data: undefined,
        isPending: false,
        isFetching: false,
        fetchStatus: 'idle',
        isSuccess: false,
        isPlaceholderData: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    if (mockAllError) {
      return {
        data: undefined,
        isPending: false,
        isFetching: false,
        fetchStatus: 'idle',
        isSuccess: false,
        isPlaceholderData: false,
        isError: true,
        error: mockAllError,
        refetch: vi.fn(),
      };
    }
    return {
      data: mockRows,
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
      'x:Domain': { type: 'object', description: 'Domain', permissionPrefix: 'domain' },
      'x:Tenant': { type: 'object', description: 'Tenant', permissionPrefix: 'tenant', enterprise: true },
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
          domainId: {
            description: 'Domain',
            type: { type: 'objectId', objectName: 'x:Domain' },
            update: 'mutable',
          },
          memberTenantId: {
            description: 'Tenant',
            type: { type: 'objectId', objectName: 'x:Tenant' },
            update: 'mutable',
            enterprise: true,
          },
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
        filters: [
          { type: 'text', field: 'text', label: 'Text' },
          { type: 'objectId', field: 'domainId', objectName: 'x:Domain', label: 'Domain' },
          { type: 'objectId', field: 'memberTenantId', objectName: 'x:Tenant', label: 'Tenant' },
        ],
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
        <TooltipProvider>
          <DynamicList viewName={viewName} />
        </TooltipProvider>
      </MemoryRouter>
    </QueryClientProvider>,
  );
}

describe('DynamicList fork customizations', () => {
  beforeEach(() => {
    directoryIds = [];
    mockRows = [];
    mockAllError = null;
    serverListCache.clear();
    useUIStore.getState().setListPageSize(100);
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
          'domainGet',
          'tenantGet',
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

  it('keeps existing server rows visible without collapsing headers when client-mode sort hits the 10k hard cap', () => {
    mockRows = [
      { id: 'u1', name: 'rizal@hilmail.co', usedDiskQuota: 850, quotas: { maxDiskQuota: 1000 }, aliases: {} },
    ];
    mockAllError = new Error('Refusing to load 19884 matching rows into the browser (limit 10000).');

    renderList('x:Account/User');

    expect(screen.getByText('rizal@hilmail.co')).toBeInTheDocument();

    // Synthetic columns carry explicit width hints so empty or error states never shift Usage / Quota left.
    const quotaHeader = screen.getByRole('button', { name: 'Usage / Quota' }).closest('th');
    const aliasesHeader = screen.getByRole('button', { name: 'Aliases' }).closest('th');
    expect(quotaHeader?.className).toContain('min-w-[9.5rem]');
    expect(aliasesHeader?.className).toContain('w-24');

    // Triggering synthetic client sort fails fetch-all, yet existing table rows remain rendered under the error banner.
    fireEvent.click(screen.getByRole('button', { name: 'Usage / Quota' }));
    expect(screen.getByRole('alert')).toHaveTextContent('Refusing to load 19884 matching rows into the browser');
    expect(screen.getByText('rizal@hilmail.co')).toBeInTheDocument();
    expect(screen.queryByText('No results found')).not.toBeInTheDocument();

    // Dismissing the client-mode error clears the failing synthetic sort override back to normal view.
    fireEvent.click(screen.getByRole('button', { name: 'Close' }));
    expect(screen.queryByRole('alert')).not.toBeInTheDocument();
    expect(screen.getByText('rizal@hilmail.co')).toBeInTheDocument();
  });

  it('defaults page size to 100 and updates uiStore when changing rows per page', () => {
    mockRows = [{ id: 'u1', name: 'alice', usedDiskQuota: 0, quotas: {}, aliases: {} }];
    renderList('x:Account/User');

    // Verify default query limit of 100 is requested from JMAP.
    const keys = Array.from(serverListCache.keys());
    expect(keys.some((k) => k.includes('"limit":100'))).toBe(true);

    const selector = screen.getByRole('combobox', { name: 'Rows per page' });
    expect(selector).toHaveTextContent('100');

    fireEvent.keyDown(selector, { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: '50' }));
    expect(useUIStore.getState().listPageSize).toBe(50);
  });

  it('hides Enterprise-only filters such as Tenant on Community edition while showing them on Enterprise', () => {
    mockRows = [{ id: 'u1', name: 'alice', usedDiskQuota: 0, quotas: {}, aliases: {} }];

    const { unmount } = renderList('x:Account/User');
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByLabelText('Text')).toBeInTheDocument();
    expect(screen.getByText('Domain')).toBeInTheDocument();
    expect(screen.queryByText('Tenant')).not.toBeInTheDocument();
    unmount();

    useAccountStore
      .getState()
      .setAccountInfo(['accountGet', 'accountQuery', 'domainGet', 'tenantGet'], 'enterprise', 'en-US');
    renderList('x:Account/User');
    fireEvent.click(screen.getByRole('button', { name: 'Filters' }));
    expect(screen.getByText('Tenant')).toBeInTheDocument();
  });
});

/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import { RouterProvider, createMemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { DynamicForm } from '@/components/forms/DynamicForm';
import { FieldRow } from '@/components/forms/FieldRow';
import { FieldScopeProvider, FormProvider } from '@/components/forms/FormProvider';
import { EmbeddedObjectEditor } from '@/components/forms/widgets/EmbeddedObjectWidget';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

let directoryIds: string[] = [];
let mockAuthSingleton: Record<string, unknown> = { defaultUserRoleIds: { 'role-user': {} } };
let mockAccountRecord: Record<string, unknown> = {
  id: 'u-1',
  '@type': 'User',
  name: 'alice',
  description: 'Local note',
  quotas: { maxDiskQuota: 1024 },
};

vi.mock('@/data/objects', () => ({
  useJmapList: (objectName: string | null) => {
    if (objectName === 'x:Directory') {
      return {
        data: { ids: directoryIds, list: directoryIds.map((id) => ({ id })), total: directoryIds.length, position: 0 },
        isPending: false,
        isFetching: false,
        fetchStatus: 'idle',
        isSuccess: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    return {
      data: { ids: [], list: [], total: 0, position: 0 },
      isPending: false,
      isFetching: false,
      fetchStatus: 'idle',
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
  useJmapObject: (objectName: string | null, id: string | null) => {
    if (!objectName || !id) {
      return {
        data: undefined,
        isPending: false,
        isFetching: false,
        fetchStatus: 'idle',
        isFetchedAfterMount: true,
        isSuccess: false,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    if (objectName === 'x:Authentication') {
      return {
        data: mockAuthSingleton,
        isPending: false,
        isFetching: false,
        fetchStatus: 'idle',
        isFetchedAfterMount: true,
        isSuccess: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    if (objectName === 'x:Role') {
      return {
        data: { id, name: id === 'role-user' ? 'User' : id },
        isPending: false,
        isFetching: false,
        fetchStatus: 'idle',
        isFetchedAfterMount: true,
        isSuccess: true,
        isError: false,
        error: null,
        refetch: vi.fn(),
      };
    }
    return {
      data: mockAccountRecord,
      isPending: false,
      isFetching: false,
      fetchStatus: 'idle',
      isFetchedAfterMount: true,
      isSuccess: true,
      isError: false,
      error: null,
      refetch: vi.fn(),
    };
  },
}));

vi.mock('@/data/objectOptions', () => ({
  useDisplayName: (_objectName: string, id: string | null) => ({
    label: id === 'role-user' ? 'User' : id,
    loading: false,
    error: null,
  }),
  useObjectOptions: () => ({
    options: [],
    loading: false,
    hasLoaded: true,
    error: null,
    ensureLoaded: vi.fn(),
  }),
}));

vi.mock('@/data/mutations', () => ({
  useJmapSet: () => ({ mutateAsync: vi.fn(), isPending: false }),
  invalidateObjectType: vi.fn(),
}));

function makeTestSchema(): Schema {
  return {
    objects: {
      'x:Account': { type: 'object', description: 'Account', permissionPrefix: 'account' },
      'x:Account/User': { type: 'view', objectName: 'x:Account' },
      'x:AccountPassword': { type: 'singleton', description: 'Password', permissionPrefix: 'password' },
      'x:Domain': { type: 'object', description: 'Domain', permissionPrefix: 'domain' },
      'x:Role': { type: 'object', description: 'Role', permissionPrefix: 'role' },
      'x:Authentication': { type: 'singleton', description: 'Authentication', permissionPrefix: 'auth' },
      UserRoles: { type: 'object', description: 'User Roles', permissionPrefix: 'role' },
      'x:Permissions': { type: 'object', description: 'Permissions', permissionPrefix: 'perm' },
    },
    schemas: {
      'x:Account': { type: 'multiple', variants: [{ name: 'User', label: 'User', schemaName: 'UserFields' }] },
      'x:AccountPassword': { type: 'single', schemaName: 'PasswordFields' },
      'x:Domain': { type: 'single', schemaName: 'DomainFields' },
      UserRoles: {
        type: 'multiple',
        variants: [
          { name: 'User', label: 'Default user role' },
          { name: 'Custom', label: 'Custom roles', schemaName: 'CustomRolesFields' },
        ],
      },
      'x:Permissions': {
        type: 'multiple',
        variants: [{ name: 'Inherit', label: 'Inherit from role' }],
      },
    },
    fields: {
      UserFields: {
        properties: {
          name: { description: 'Username', type: { type: 'string', format: 'string' }, update: 'mutable' },
          description: { description: 'Notes', type: { type: 'string', format: 'string' }, update: 'mutable' },
          quotas: { description: 'Quotas', type: { type: 'string', format: 'string' }, update: 'mutable' },
        },
      },
      PasswordFields: {
        properties: {
          secret: { description: 'Secret', type: { type: 'string', format: 'secret' }, update: 'mutable' },
        },
      },
      DomainFields: {
        properties: {
          allowRelaying: { description: 'Allow relaying', type: { type: 'boolean' }, update: 'mutable' },
        },
      },
      CustomRolesFields: {
        properties: {
          roleIds: { description: 'Roles', type: { type: 'string', format: 'string' }, update: 'mutable' },
        },
      },
    },
    forms: {
      UserFields: {
        sections: [
          {
            fields: [
              { name: 'name', label: 'Username' },
              { name: 'description', label: 'Description' },
              { name: 'quotas', label: 'Quotas' },
            ],
          },
        ],
      },
      PasswordFields: {
        sections: [{ fields: [{ name: 'secret', label: 'New Password' }] }],
      },
      DomainFields: {
        sections: [{ fields: [{ name: 'allowRelaying', label: 'Allow Relaying' }] }],
      },
    },
    lists: {
      'x:Account/User': {
        title: 'Users',
        subtitle: '',
        singularName: 'User',
        pluralName: 'Users',
        columns: [{ name: 'name', label: 'Username' }],
        labelProperty: 'name',
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
    ],
  };
}

function renderWithRouter(node: React.ReactElement) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const router = createMemoryRouter([{ path: '*', element: node }], { initialEntries: ['/directory/x:Account/User'] });
  return render(
    <QueryClientProvider client={client}>
      <RouterProvider router={router} />
    </QueryClientProvider>,
  );
}

describe('External directory safeguards, HilMail notices, and inherited role guidance', () => {
  beforeEach(() => {
    directoryIds = [];
    mockAuthSingleton = { defaultUserRoleIds: { 'role-user': {} } };
    mockAccountRecord = {
      id: 'u-1',
      '@type': 'User',
      name: 'alice',
      description: 'Local note',
      quotas: '512',
    };
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
          'passwordGet',
          'passwordUpdate',
          'authGet',
        ],
        'community',
        'en-US',
      );
  });

  it('selectively locks top-level external identity fields while preserving local edits and rendering HilMail notices', () => {
    const schema = makeTestSchema();
    renderWithRouter(
      <FormProvider schema={schema} viewName="x:Account/User" mode="edit" isExternalAccount hasExternalDirectory>
        <FieldRow
          field={{ description: '', type: { type: 'string', format: 'string' }, update: 'mutable' }}
          formField={{ name: 'name', label: 'Username' }}
          value="alice"
          onChange={vi.fn()}
        />
        <FieldRow
          field={{ description: '', type: { type: 'string', format: 'string' }, update: 'mutable' }}
          formField={{ name: 'quotas', label: 'Quotas' }}
          value="500MB"
          onChange={vi.fn()}
        />
        <FieldScopeProvider name="nestedObject" readOnly={false}>
          <FieldRow
            field={{ description: '', type: { type: 'string', format: 'string' }, update: 'mutable' }}
            formField={{ name: 'name', label: 'Nested Rule Name' }}
            value="rule-1"
            onChange={vi.fn()}
          />
        </FieldScopeProvider>
      </FormProvider>,
    );

    // Top-level external identity property is locked (rendered read-only via FieldValue instead of an editable input).
    expect(screen.queryByRole('textbox', { name: 'Username' })).not.toBeInTheDocument();
    expect(screen.getByText('alice')).toBeInTheDocument();

    // Local Stalwart property `quotas` remains editable while showing the HilMail quota sync notice.
    expect(screen.getByRole('textbox', { name: /Quotas/i })).toBeInTheDocument();
    expect(screen.getByText('Synced by HilMail API')).toBeInTheDocument();

    // Nested fields sharing an identity field name must not be falsely locked by top-level directory rules.
    expect(screen.getByRole('textbox', { name: 'Nested Rule Name' })).toBeInTheDocument();
  });

  it('shows HilMail reconciliation notice on synced x:Domain fields only during edit mode when directory exists', () => {
    const schema = makeTestSchema();
    const { rerender } = renderWithRouter(
      <FormProvider schema={schema} viewName="x:Domain" mode="edit" hasExternalDirectory>
        <FieldRow
          field={{ description: '', type: { type: 'boolean' }, update: 'mutable' }}
          formField={{ name: 'allowRelaying', label: 'Allow Relaying' }}
          value={false}
          onChange={vi.fn()}
        />
      </FormProvider>,
    );

    expect(screen.getByText('Reconciled by HilMail API')).toBeInTheDocument();

    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <FormProvider schema={schema} viewName="x:Domain" mode="create" hasExternalDirectory>
          <FieldRow
            field={{ description: '', type: { type: 'boolean' }, update: 'mutable' }}
            formField={{ name: 'allowRelaying', label: 'Allow Relaying' }}
            value={false}
            onChange={vi.fn()}
          />
        </FormProvider>
      </QueryClientProvider>,
    );

    expect(screen.queryByText('Reconciled by HilMail API')).not.toBeInTheDocument();
  });

  it('displays inherited default role badges and inherited permissions messages on embedded presets', () => {
    const schema = makeTestSchema();
    renderWithRouter(
      <FormProvider schema={schema} viewName="x:Account/User" mode="edit">
        <EmbeddedObjectEditor objectName="UserRoles" value={{ '@type': 'User' }} onChange={vi.fn()} readOnly={false} />
        <EmbeddedObjectEditor
          objectName="x:Permissions"
          value={{ '@type': 'Inherit' }}
          onChange={vi.fn()}
          readOnly={false}
        />
      </FormProvider>,
    );

    expect(screen.getByText('Inherited default user roles:')).toBeInTheDocument();
    expect(screen.getByText('User')).toBeInTheDocument();
    expect(screen.getByText('Permissions are automatically inherited from assigned roles.')).toBeInTheDocument();
  });

  it('blocks direct user creation and password management forms when an external directory is configured', () => {
    directoryIds = ['sql-dir'];

    const { unmount } = renderWithRouter(<DynamicForm viewName="x:Account/User" objectId={null} />);
    expect(screen.getByText('User Account Creation is Managed Externally')).toBeInTheDocument();
    unmount();

    renderWithRouter(<DynamicForm viewName="x:AccountPassword" objectId="singleton" />);
    expect(screen.getByText('Password Management is Handled Externally')).toBeInTheDocument();
  });

  it('renders external notice, Raw JSON button, and omits Delete button on existing external user edit', () => {
    directoryIds = ['sql-dir'];

    renderWithRouter(<DynamicForm viewName="x:Account/User" objectId="u-1" />);

    expect(screen.getByText('Account Managed by External Directory')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Raw JSON' })).toBeInTheDocument();
    expect(screen.queryByRole('button', { name: 'Delete' })).not.toBeInTheDocument();
    expect(screen.getByText('Synced by HilMail API')).toBeInTheDocument();
  });
});

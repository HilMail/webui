/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { act, renderHook } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { useGlobalSearch } from '@/hooks/useGlobalSearch';
import { useAccountStore } from '@/stores/accountStore';
import { useSchemaStore } from '@/stores/schemaStore';
import type { Schema } from '@/types/schema';

function createSchema(): Schema {
  return {
    objects: {
      'x:Account': { type: 'object', description: 'Account', permissionPrefix: 'account' },
      'x:Account/User': { type: 'view', objectName: 'x:Account' },
      'x:Tenant': { type: 'object', description: 'Tenant', permissionPrefix: 'tenant', enterprise: true },
    },
    schemas: {
      'x:Account': { type: 'single', schemaName: 'User' },
      'x:Tenant': { type: 'single', schemaName: 'Tenant' },
    },
    fields: {
      User: {
        properties: {
          name: {
            description: 'Username',
            type: { type: 'string', format: 'string' },
            update: 'mutable',
          },
          memberTenantId: {
            description: 'Tenant ID',
            type: { type: 'objectId', objectName: 'x:Tenant' },
            update: 'mutable',
          },
          enterpriseTag: {
            description: 'Enterprise tag',
            type: { type: 'string', format: 'string' },
            update: 'mutable',
            enterprise: true,
          },
        },
      },
      Tenant: {
        properties: {
          name: {
            description: 'Tenant name',
            type: { type: 'string', format: 'string' },
            update: 'mutable',
          },
        },
      },
    },
    forms: {
      'x:Account/User': {
        sections: [
          {
            title: 'General',
            fields: [
              { name: 'name', label: 'Username' },
              { name: 'enterpriseTag', label: 'Enterprise Tag' },
            ],
          },
          {
            title: 'Tenant Isolation',
            fields: [{ name: 'memberTenantId', label: 'Tenant Assignment' }],
          },
        ],
      },
      'x:Tenant': {
        sections: [
          {
            title: 'Tenant Settings',
            fields: [{ name: 'name', label: 'Tenant Label' }],
          },
        ],
      },
    },
    lists: {},
    enums: {},
    dashboards: [],
    layouts: [
      {
        name: 'Directory',
        icon: 'users',
        items: [
          { link: { name: 'Accounts', icon: 'user', viewName: 'x:Account/User' } },
          { link: { name: 'Tenants', icon: 'building', viewName: 'x:Tenant' } },
        ],
      },
    ],
  };
}

function renderSearchHook() {
  return renderHook(() => useGlobalSearch(), {
    wrapper: ({ children }) => <MemoryRouter>{children}</MemoryRouter>,
  });
}

describe('useGlobalSearch Enterprise filtering', () => {
  beforeEach(() => {
    useSchemaStore.getState().setSchema(createSchema());
    // Grant all object permissions so tests isolate edition filtering from permission filtering.
    useAccountStore.getState().setAccountInfo(['accountGet', 'tenantGet'], 'community', 'en-US');
  });

  it('excludes Enterprise pages, sections, and fields on Community edition', () => {
    const { result } = renderSearchHook();

    // Searching for "Tenant" matches Tenants page, Tenant Settings section/field, and Tenant Assignment/Isolation on User.
    act(() => {
      result.current.setQuery('Tenant');
    });
    expect(result.current.results).toEqual([]);

    // Directly marked Enterprise fields on non-Enterprise forms are also hidden on Community.
    act(() => {
      result.current.setQuery('Enterprise Tag');
    });
    expect(result.current.results).toEqual([]);

    // Regular pages, client-only Overview, and non-Enterprise fields remain searchable on Community.
    act(() => {
      result.current.setQuery('Username');
    });
    expect(result.current.results.map((r) => r.text)).toContain('Username');

    act(() => {
      result.current.setQuery('Overview');
    });
    expect(result.current.results.map((r) => r.viewName)).toContain('CustomComponent/Overview');

    act(() => {
      result.current.setQuery('prometheus');
    });
    expect(result.current.results.map((r) => r.viewName)).toContain('CustomComponent/CommunityHealth');
  });

  it('includes permitted Enterprise pages, sections, and fields on Enterprise edition', () => {
    useAccountStore.getState().setAccountInfo(['accountGet', 'tenantGet'], 'enterprise', 'en-US');
    const { result } = renderSearchHook();

    act(() => {
      result.current.setQuery('Tenant');
    });
    const labels = result.current.results.map((r) => r.text);
    expect(labels).toContain('Tenants');
    expect(labels).toContain('Tenant Assignment');
    expect(labels).toContain('Tenant Isolation');
    expect(labels).toContain('Tenant Settings');

    act(() => {
      result.current.setQuery('Enterprise Tag');
    });
    expect(result.current.results.map((r) => r.text)).toContain('Enterprise Tag');
  });
});

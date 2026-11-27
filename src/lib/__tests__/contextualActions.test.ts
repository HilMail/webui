/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { resolveContextualActions } from '@/lib/contextualActions';
import { createPermissionCheckers } from '@/lib/permissions';
import type { Schema } from '@/types/schema';

function createActionSchema(): Schema {
  return {
    objects: {
      'x:Action': { type: 'object', description: 'Action', permissionPrefix: 'sysAction' },
      'x:Account': { type: 'object', description: 'Account', permissionPrefix: 'account' },
      'x:Certificate': { type: 'object', description: 'Certificate', permissionPrefix: 'cert' },
      'x:BlockedIp': { type: 'object', description: 'Blocked IP', permissionPrefix: 'blocked' },
      'x:Directory': { type: 'object', description: 'Directory', permissionPrefix: 'directory' },
      'x:Domain': { type: 'object', description: 'Domain', permissionPrefix: 'domain' },
      'x:StoreLookup': { type: 'object', description: 'Lookup store', permissionPrefix: 'lookup' },
      'x:Log': { type: 'object', description: 'Log', permissionPrefix: 'log' },
    },
    schemas: {
      'x:Action': {
        type: 'multiple',
        variants: [
          { name: 'InvalidateNegativeCaches', label: 'Invalidate negative caches' },
          { name: 'InvalidateCaches', label: 'Invalidate caches' },
          { name: 'ReloadTlsCertificates', label: 'Reload TLS certificates' },
          { name: 'ReloadBlockedIps', label: 'Reload blocked IPs' },
          { name: 'ReloadLookupStores', label: 'Reload lookup stores' },
        ],
      },
    },
    fields: {},
    forms: {},
    lists: {},
    enums: {},
    dashboards: [],
    layouts: [],
  };
}

describe('resolveContextualActions', () => {
  it('returns matching cache and reload actions when x:Action Create and per-action permissions are granted', () => {
    const schema = createActionSchema();
    const checkers = createPermissionCheckers([
      'sysActionCreate',
      'actionInvalidateNegativeCaches',
      'actionInvalidateCaches',
      'actionReloadTlsCertificates',
      'actionReloadBlockedIps',
      'actionReloadLookupStores',
    ]);

    expect(resolveContextualActions(schema, 'x:Account', checkers).map((a) => a.actionType)).toEqual([
      'InvalidateNegativeCaches',
      'InvalidateCaches',
    ]);
    expect(resolveContextualActions(schema, 'x:Directory', checkers).map((a) => a.actionType)).toEqual([
      'InvalidateNegativeCaches',
      'InvalidateCaches',
    ]);
    expect(resolveContextualActions(schema, 'x:Domain', checkers).map((a) => a.actionType)).toEqual([
      'InvalidateNegativeCaches',
      'InvalidateCaches',
    ]);
    expect(resolveContextualActions(schema, 'x:Certificate', checkers).map((a) => a.actionType)).toEqual([
      'ReloadTlsCertificates',
    ]);
    expect(resolveContextualActions(schema, 'x:BlockedIp', checkers).map((a) => a.actionType)).toEqual([
      'ReloadBlockedIps',
    ]);
    expect(resolveContextualActions(schema, 'x:StoreLookup', checkers).map((a) => a.actionType)).toEqual([
      'ReloadLookupStores',
    ]);
    expect(resolveContextualActions(schema, 'x:Log', checkers)).toEqual([]);
  });

  it('requires both sysActionCreate and the specific action permission', () => {
    const schema = createActionSchema();

    expect(
      resolveContextualActions(schema, 'x:Account', createPermissionCheckers(['actionInvalidateNegativeCaches'])),
    ).toEqual([]);

    expect(
      resolveContextualActions(
        schema,
        'x:Account',
        createPermissionCheckers(['sysActionCreate', 'actionInvalidateNegativeCaches']),
      ).map((a) => a.actionType),
    ).toEqual(['InvalidateNegativeCaches']);
  });
});

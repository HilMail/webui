/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import type { PermissionCheckers } from '@/lib/permissions';
import { resolveObject, resolveSchema } from '@/lib/schemaResolver';
import type { Schema } from '@/types/schema';

export type ContextualActionType =
  | 'InvalidateNegativeCaches'
  | 'InvalidateCaches'
  | 'ReloadTlsCertificates'
  | 'ReloadBlockedIps'
  | 'ReloadLookupStores';

export interface ContextualActionDef {
  actionType: ContextualActionType;
  labelKey: [string, string];
  successKey: [string, string];
  descriptionKey: [string, string];
}

const CACHE_ACTIONS: readonly ContextualActionDef[] = [
  {
    actionType: 'InvalidateNegativeCaches',
    labelKey: ['list.actionInvalidateNegativeCaches', 'Clear negative cache'],
    successKey: ['list.actionInvalidateNegativeCachesDone', 'Cleared negative lookup caches'],
    descriptionKey: [
      'list.actionInvalidateNegativeCachesDesc',
      'Clear cached "not found" lookups and external directory recipient entries',
    ],
  },
  {
    actionType: 'InvalidateCaches',
    labelKey: ['list.actionInvalidateCaches', 'Clear all caches'],
    successKey: ['list.actionInvalidateCachesDone', 'Cleared all server caches'],
    descriptionKey: [
      'list.actionInvalidateCachesDesc',
      'Clear all in-memory server caches including accounts, domains, and tokens',
    ],
  },
];

const CONTEXTUAL_ACTIONS_BY_OBJECT: Readonly<Record<string, readonly ContextualActionDef[]>> = {
  'x:Account': CACHE_ACTIONS,
  'x:Directory': CACHE_ACTIONS,
  'x:Domain': CACHE_ACTIONS,
  'x:Certificate': [
    {
      actionType: 'ReloadTlsCertificates',
      labelKey: ['list.actionReloadTlsCertificates', 'Reload certificates'],
      successKey: ['list.actionReloadTlsCertificatesDone', 'Reloaded TLS certificates'],
      descriptionKey: [
        'list.actionReloadTlsCertificatesDesc',
        'Reload TLS certificates into active listeners',
      ],
    },
  ],
  'x:BlockedIp': [
    {
      actionType: 'ReloadBlockedIps',
      labelKey: ['list.actionReloadBlockedIps', 'Reload blocked IPs'],
      successKey: ['list.actionReloadBlockedIpsDone', 'Reloaded blocked IP rules'],
      descriptionKey: [
        'list.actionReloadBlockedIpsDesc',
        'Reload blocked IP rules into active listeners',
      ],
    },
  ],
  'x:StoreLookup': [
    {
      actionType: 'ReloadLookupStores',
      labelKey: ['list.actionReloadLookupStores', 'Reload lookup stores'],
      successKey: ['list.actionReloadLookupStoresDone', 'Reloaded lookup stores'],
      descriptionKey: [
        'list.actionReloadLookupStoresDesc',
        'Reload lookup store tables and entries',
      ],
    },
  ],
};

/**
 * Returns `x:Action` shortcuts relevant to the current list object when the signed-in admin
 * has both `x:Action` create access and the individual `action<Variant>` permission.
 */
export function resolveContextualActions(
  schema: Schema,
  objectName: string,
  checkers: PermissionCheckers,
): readonly ContextualActionDef[] {
  const candidates = CONTEXTUAL_ACTIONS_BY_OBJECT[objectName];
  if (!candidates || candidates.length === 0) return [];

  const actionObj = resolveObject(schema, 'x:Action');
  if (!actionObj || !checkers.hasObjectPermission(actionObj.permissionPrefix, 'Create')) {
    return [];
  }

  const actionSchema = resolveSchema(schema, actionObj.objectName);
  const availableVariants =
    actionSchema?.type === 'multiple' ? new Set(actionSchema.variants.map((v) => v.name)) : null;

  return candidates.filter((entry) => {
    if (availableVariants && availableVariants.size > 0 && !availableVariants.has(entry.actionType)) {
      return false;
    }
    return checkers.hasPermission(`action${entry.actionType}`);
  });
}

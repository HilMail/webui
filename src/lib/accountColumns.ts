/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import type { Schema } from '@/types/schema';
import { clientSortable } from '@/lib/schemaDeviationTypes';

/**
 * Appends synthetic "Usage / Quota" and "Aliases" columns to the `x:Account/User` list.
 *
 * Stalwart's server schema omits disk quota usage and alias count from the users
 * table, forcing admins to open each account individually. Both columns are
 * synthetic (computed from `usedDiskQuota`/`quotas` and `aliases`), so they are
 * marked `clientSortable` to sort locally in the browser rather than sending
 * unknown sort properties to JMAP.
 */
export function withAccountListColumns(schema: Schema): Schema {
  const userList = schema.lists['x:Account/User'];
  if (!userList) return schema;

  // Guard against duplicate insertion if a server schema ever adds these columns natively.
  const existing = new Set(userList.columns.map((c) => c.name));
  const extraColumns = [
    ...(!existing.has('quotaUsage') ? [clientSortable({ name: 'quotaUsage', label: 'Usage / Quota' })] : []),
    ...(!existing.has('aliasCount') ? [clientSortable({ name: 'aliasCount', label: 'Aliases' })] : []),
  ];
  if (extraColumns.length === 0) return schema;

  return {
    ...schema,
    lists: {
      ...schema.lists,
      'x:Account/User': {
        ...userList,
        columns: [...userList.columns, ...extraColumns],
      },
    },
  };
}

/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import type { FilterEnum } from '@/types/schema';
import type { Schema } from '@/types/schema';

/**
 * Type augmentation for client-only enum filters that Stalwart's server `/query`
 * rejects (`level`, `event` on `x:Log`) and that `clientList` evaluates in memory.
 */
export type ClientOnlyFilterEnum = FilterEnum & { clientOnly?: boolean };

/** Returns true when a filter definition must run in the browser instead of on JMAP `/query`. */
export function isClientOnlyFilterEnum(filter: { type: string }): filter is ClientOnlyFilterEnum {
  return (filter as ClientOnlyFilterEnum).clientOnly === true;
}

/**
 * Appends client-side `level` and `event` enum filters to `x:Log` because
 * Stalwart v1 `x:Log/query` only supports text substring filtering on the server.
 */
export function withClientLogFilters(schema: Schema): Schema {
  const logList = schema.lists['x:Log'];
  if (!logList || !schema.enums['TracingLevel'] || !schema.enums['EventType']) return schema;

  const existing = new Set((logList.filters ?? []).map((f) => f.field));
  const extra: ClientOnlyFilterEnum[] = [];

  if (!existing.has('level')) {
    extra.push({
      type: 'enum',
      field: 'level',
      enumName: 'TracingLevel',
      label: 'Level',
      clientOnly: true,
    });
  }
  if (!existing.has('event')) {
    extra.push({
      type: 'enum',
      field: 'event',
      enumName: 'EventType',
      label: 'Event',
      clientOnly: true,
    });
  }
  if (extra.length === 0) return schema;

  return {
    ...schema,
    lists: {
      ...schema.lists,
      'x:Log': {
        ...logList,
        filters: [...(logList.filters ?? []), ...extra],
      },
    },
  };
}

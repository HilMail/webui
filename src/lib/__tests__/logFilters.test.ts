/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { buildListFilter } from '@/components/lists/listQuery';
import { isClientOnlyFilterEnum, withClientLogFilters } from '@/lib/logFilters';
import type { List, Schema } from '@/types/schema';

function makeLogSchema(): Schema {
  return {
    objects: {},
    schemas: {},
    fields: {},
    forms: {},
    lists: {
      'x:Log': {
        title: 'Log Entries',
        subtitle: '',
        singularName: 'Log Entry',
        pluralName: 'Log Entries',
        columns: [{ name: 'timestamp', label: 'Timestamp' }],
        filters: [{ type: 'text', field: 'text', label: 'Search' }],
        labelProperty: 'id',
      },
    },
    enums: {
      TracingLevel: [{ name: 'Error', label: 'Error' }],
      EventType: [{ name: 'Smtp', label: 'SMTP' }],
    },
    dashboards: [],
    layouts: [],
  };
}

describe('logFilters and buildListFilter integration', () => {
  it('adds clientOnly level and event enum filters once onto x:Log schema', () => {
    const once = withClientLogFilters(makeLogSchema());
    const twice = withClientLogFilters(once);
    const filters = once.lists['x:Log'].filters ?? [];

    expect(twice).toBe(once);
    expect(filters.map((f) => f.field)).toEqual(['text', 'level', 'event']);
    expect(isClientOnlyFilterEnum(filters[1])).toBe(true);
    expect(isClientOnlyFilterEnum(filters[2])).toBe(true);
    expect(isClientOnlyFilterEnum(filters[0])).toBe(false);
  });

  it('strips clientOnly filters from JMAP server /query filter payloads', () => {
    const schema = withClientLogFilters(makeLogSchema());
    const logList: List = schema.lists['x:Log'];

    // Stalwart's x:Log/query rejects non-text filters, so only `text` may reach the server payload.
    const serverFilter = buildListFilter({ text: 'bounced', level: 'Error', event: 'Smtp' }, logList, 'x:Log');
    expect(serverFilter).toEqual({ text: 'bounced' });
  });
});

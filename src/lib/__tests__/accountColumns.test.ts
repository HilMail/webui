/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { withAccountListColumns } from '@/lib/accountColumns';
import { isClientSortableColumn } from '@/lib/schemaDeviationTypes';
import type { Schema } from '@/types/schema';

function makeMinimalSchema(
  columns: Array<{ name: string; label: string }> = [{ name: 'name', label: 'Username' }],
): Schema {
  return {
    objects: {},
    schemas: {},
    fields: {},
    forms: {},
    lists: {
      'x:Account/User': {
        title: 'Users',
        subtitle: '',
        singularName: 'User',
        pluralName: 'Users',
        columns,
        labelProperty: 'name',
      },
    },
    enums: {},
    dashboards: [],
    layouts: [],
  };
}

describe('withAccountListColumns', () => {
  it('appends Usage / Quota and Aliases as client-sortable columns on x:Account/User', () => {
    const schema = makeMinimalSchema();
    const patched = withAccountListColumns(schema);
    const cols = patched.lists['x:Account/User'].columns;

    expect(cols.map((c) => c.name)).toEqual(['name', 'quotaUsage', 'aliasCount']);
    // Both synthetic columns must carry clientSortable so list queries never send unknown sort keys to JMAP.
    expect(isClientSortableColumn(cols[1])).toBe(true);
    expect(isClientSortableColumn(cols[2])).toBe(true);
    expect(isClientSortableColumn(cols[0])).toBe(false);
  });

  it('does not duplicate columns if upstream schema already provides them or patch runs twice', () => {
    const once = withAccountListColumns(makeMinimalSchema());
    const twice = withAccountListColumns(once);

    expect(twice).toBe(once);
    expect(twice.lists['x:Account/User'].columns.map((c) => c.name)).toEqual(['name', 'quotaUsage', 'aliasCount']);
  });

  it('returns the schema unchanged when x:Account/User list is absent', () => {
    const empty: Schema = { ...makeMinimalSchema(), lists: {} };
    expect(withAccountListColumns(empty)).toBe(empty);
  });
});

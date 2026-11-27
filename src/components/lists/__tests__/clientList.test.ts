/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import {
  LOG_TIME_RANGE_KEY,
  QUOTA_STATE_FILTER_KEY,
  planClientMode,
  processClientRows,
} from '@/components/lists/clientList';
import { withAccountListColumns } from '@/lib/accountColumns';
import { withClientLogFilters } from '@/lib/logFilters';
import type { Schema } from '@/types/schema';

function makeTestSchema(): Schema {
  const base: Schema = {
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
        columns: [{ name: 'name', label: 'Username' }],
        sort: ['name'],
        labelProperty: 'name',
      },
      'x:Log': {
        title: 'Logs',
        subtitle: '',
        singularName: 'Log',
        pluralName: 'Logs',
        columns: [
          { name: 'timestamp', label: 'Time' },
          { name: 'level', label: 'Level' },
          { name: 'event', label: 'Event' },
        ],
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
  return withClientLogFilters(withAccountListColumns(base));
}

describe('planClientMode and processClientRows', () => {
  it('stays in server mode for normal server-sorted lists', () => {
    const schema = makeTestSchema();
    const plan = planClientMode(schema.lists['x:Account/User'], 'x:Account', {
      filters: { name: 'alice' },
      sort: { field: 'name', ascending: true },
      anchors: [],
    });

    expect(plan.client).toBe(false);
    expect(plan.clientSort).toBeNull();
  });

  it('filters account rows by near, over, and negative quota states and sorts numerically', () => {
    const schema = makeTestSchema();
    const userList = schema.lists['x:Account/User'];
    const rows = [
      { id: 'healthy', usedDiskQuota: 100, quotas: { maxDiskQuota: 1000 } },
      { id: 'near', usedDiskQuota: 850, quotas: { maxDiskQuota: 1000 } },
      { id: 'over', usedDiskQuota: 1200, quotas: { maxDiskQuota: 1000 } },
      { id: 'negative', usedDiskQuota: -50, quotas: { maxDiskQuota: 1000 } },
      { id: 'unlimited', usedDiskQuota: 5000, quotas: { maxDiskQuota: 0 } },
    ];

    const nearPlan = planClientMode(userList, 'x:Account', {
      filters: { [QUOTA_STATE_FILTER_KEY]: 'near' },
      sort: { field: 'quotaUsage', ascending: false },
      anchors: [],
    });
    expect(nearPlan.client).toBe(true);
    expect(nearPlan.requiredProperties).toEqual(['usedDiskQuota', 'quotas']);
    expect(processClientRows(rows, nearPlan).map((r) => r.id)).toEqual(['over', 'near']);

    const overPlan = planClientMode(userList, 'x:Account', {
      filters: { [QUOTA_STATE_FILTER_KEY]: 'over' },
      sort: null,
      anchors: [],
    });
    expect(processClientRows(rows, overPlan).map((r) => r.id)).toEqual(['over']);

    const negativePlan = planClientMode(userList, 'x:Account', {
      filters: { [QUOTA_STATE_FILTER_KEY]: 'negative' },
      sort: null,
      anchors: [],
    });
    expect(processClientRows(rows, negativePlan).map((r) => r.id)).toEqual(['negative']);
  });

  it('filters x:Log rows by relative timeRange and clientOnly level/event enum criteria', () => {
    const schema = makeTestSchema();
    const logList = schema.lists['x:Log'];
    const now = Date.parse('2026-11-27T12:00:00Z');
    const rows = [
      { id: 'recent-err', timestamp: '2026-11-27T11:52:00Z', level: 'Error', event: 'Smtp' },
      { id: 'recent-info', timestamp: '2026-11-27T11:55:00Z', level: 'Info', event: 'Smtp' },
      { id: 'stale-err', timestamp: '2026-11-27T10:30:00Z', level: 'Error', event: 'Smtp' },
    ];

    const plan = planClientMode(logList, 'x:Log', {
      filters: { [LOG_TIME_RANGE_KEY]: '15m', level: 'Error', event: 'Smtp' },
      sort: null,
      anchors: [],
    });

    expect(plan.client).toBe(true);
    expect(plan.requiredProperties).toEqual(['timestamp', 'level', 'event']);
    expect(processClientRows(rows, plan, now).map((r) => r.id)).toEqual(['recent-err']);
  });
});

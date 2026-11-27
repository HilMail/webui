/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import {
  computeQuotaUsage,
  expandListProperties,
  getClientSortValue,
  getCountColumnValue,
  hasSyntheticCell,
} from '@/lib/syntheticColumns';

describe('syntheticColumns', () => {
  it('identifies synthetic list columns separately from regular schema fields', () => {
    expect(hasSyntheticCell('quotaUsage')).toBe(true);
    expect(hasSyntheticCell('aliasCount')).toBe(true);
    expect(hasSyntheticCell('name')).toBe(false);
  });

  it('translates synthetic columns into their underlying JMAP properties and includes id', () => {
    const props = expandListProperties([
      { name: 'name' },
      { name: 'quotaUsage' },
      { name: 'aliasCount' },
      { name: 'usedDiskQuota' },
    ]);

    // Ensure id is always requested (needed for row keys & quota recalculation) without duplicates.
    expect(props).toEqual(['id', 'name', 'usedDiskQuota', 'quotas', 'aliases']);
  });

  it('computes disk usage and preserves negative counters while normalizing missing/zero quotas', () => {
    expect(computeQuotaUsage({ usedDiskQuota: 512, quotas: { maxDiskQuota: 1024 } })).toEqual({
      used: 512,
      limit: 1024,
    });
    expect(computeQuotaUsage({ usedDiskQuota: -4096, quotas: { maxDiskQuota: 1024 } })).toEqual({
      used: -4096,
      limit: 1024,
    });
    expect(computeQuotaUsage({ usedDiskQuota: 200, quotas: { maxDiskQuota: 0 } })).toEqual({
      used: 200,
      limit: 0,
    });
    expect(computeQuotaUsage({})).toEqual({ used: 0, limit: 0 });
  });

  it('counts alias map entries and sorts synthetic columns numerically', () => {
    const account = {
      usedDiskQuota: 2048,
      quotas: { maxDiskQuota: 4096 },
      aliases: {
        a1: { name: 'sales', domainId: 'd1', enable: true },
        a2: { name: 'info', domainId: 'd1', enable: false },
      },
    };

    expect(getCountColumnValue('aliasCount', account)).toBe(2);
    expect(getCountColumnValue('aliasCount', {})).toBe(0);
    expect(getClientSortValue('quotaUsage', account)).toBe(2048);
    expect(getClientSortValue('aliasCount', account)).toBe(2);
  });
});

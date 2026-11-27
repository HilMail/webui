/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

/**
 * Synthetic list columns are UI-derived columns not backed 1:1 by a server
 * property. This module maps them to the real JMAP properties they require,
 * extracts their display metrics, and produces comparable values for client-side
 * sorting.
 */

export const QUOTA_USAGE_COLUMN = 'quotaUsage';

/** Count columns mapped to the JMAP `objectList` / map property whose entries they count. */
export const COUNT_COLUMN_SOURCES: Record<string, string> = {
  aliasCount: 'aliases',
};

/** Returns true for columns rendered by `SyntheticCell` instead of the generic field pipeline. */
export function hasSyntheticCell(column: string): boolean {
  return column === QUOTA_USAGE_COLUMN || column in COUNT_COLUMN_SOURCES;
}

/**
 * Translates UI list columns (including synthetic ones) into the real JMAP
 * `properties` array requested from `/get` so we don't ask the server for
 * non-existent synthetic property names.
 */
export function expandListProperties(columns: ReadonlyArray<{ name: string }>): string[] {
  const properties = new Set<string>(['id']);
  for (const { name } of columns) {
    if (name === QUOTA_USAGE_COLUMN) {
      properties.add('usedDiskQuota');
      properties.add('quotas');
    } else if (name in COUNT_COLUMN_SOURCES) {
      properties.add(COUNT_COLUMN_SOURCES[name]);
    } else {
      properties.add(name);
    }
  }
  return [...properties];
}

/**
 * Extracts `{ used, limit }` disk quota bytes from an account record.
 * Keeps negative `usedDiskQuota` values intact so `SizeDisplay` can flag stale
 * quota counters, while treating missing or non-positive limits as unlimited (`0`).
 */
export function computeQuotaUsage(item: Record<string, unknown>): { used: number; limit: number } {
  const rawUsed = typeof item.usedDiskQuota === 'number' ? item.usedDiskQuota : 0;
  const used = Number.isFinite(rawUsed) ? rawUsed : 0;
  const quotas = item.quotas as Record<string, unknown> | undefined;
  const rawLimit = quotas && typeof quotas.maxDiskQuota === 'number' ? quotas.maxDiskQuota : 0;
  const limit = Number.isFinite(rawLimit) && rawLimit > 0 ? rawLimit : 0;
  return { used, limit };
}

/** Counts entries in a JMAP `objectList` (wire-encoded as an ID-keyed map). */
export function getCountColumnValue(colName: string, item: Record<string, unknown>): number {
  const source = COUNT_COLUMN_SOURCES[colName];
  const entries = source ? item[source] : undefined;
  return entries && typeof entries === 'object' ? Object.keys(entries).length : 0;
}

/** Returns a sortable primitive for client-side sorting on synthetic or standard columns. */
export function getClientSortValue(colName: string, item: Record<string, unknown>): string | number {
  // Sort quota usage by actual bytes used so unlimited accounts compare naturally with capped ones.
  if (colName === QUOTA_USAGE_COLUMN) return computeQuotaUsage(item).used;
  if (colName in COUNT_COLUMN_SOURCES) return getCountColumnValue(colName, item);
  const raw = item[colName];
  return typeof raw === 'number' ? raw : String(raw ?? '');
}

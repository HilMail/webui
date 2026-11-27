/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { isClientOnlyFilterEnum } from '@/lib/logFilters';
import { isClientSortableColumn } from '@/lib/schemaDeviationTypes';
import { QUOTA_USAGE_COLUMN, computeQuotaUsage, getClientSortValue } from '@/lib/syntheticColumns';
import type { Filter, List } from '@/types/schema';
import type { ListItem } from './listQuery';
import type { ListUrlState } from './listUrlState';

export const QUOTA_STATE_FILTER_KEY = 'quotaState';
export const QUOTA_STATES = ['near', 'over', 'negative'] as const;
export type QuotaStateFilter = (typeof QUOTA_STATES)[number];

export const LOG_TIME_RANGE_KEY = 'timeRange';
export const LOG_TIME_RANGES = ['15m', '1h', '24h'] as const;
export type LogTimeRange = (typeof LOG_TIME_RANGES)[number];

const RANGE_MS: Record<LogTimeRange, number> = {
  '15m': 15 * 60_000,
  '1h': 60 * 60_000,
  '24h': 24 * 60 * 60_000,
};

export interface ClientEnumCriterion {
  field: string;
  value: string;
}

export interface ClientModePlan {
  /** True when rows must be fetched in full and filtered/sorted locally. */
  client: boolean;
  clientSort: { field: string; ascending: boolean } | null;
  quotaState: QuotaStateFilter | null;
  timeRange: LogTimeRange | null;
  clientFilters: ClientEnumCriterion[];
  requiredProperties: string[];
}

/** Checks whether a list column is configured for browser-side sorting. */
export function isClientSortField(list: Pick<List, 'columns'>, field: string): boolean {
  return list.columns.some((c) => c.name === field && isClientSortableColumn(c));
}

function isQuotaStateFilter(value: string | undefined): value is QuotaStateFilter {
  return !!value && (QUOTA_STATES as readonly string[]).includes(value);
}

function isLogTimeRange(value: string | undefined): value is LogTimeRange {
  return !!value && (LOG_TIME_RANGES as readonly string[]).includes(value);
}

/**
 * Determines whether the current list state needs fetch-all + local filtering/sorting
 * (either for a synthetic column sort or for client-only quota, log time-window, or enum filters).
 */
export function planClientMode(
  list: Pick<List, 'columns' | 'filters'>,
  objectName: string,
  state: ListUrlState,
): ClientModePlan {
  const clientSort = state.sort && isClientSortField(list, state.sort.field) ? state.sort : null;

  const hasQuotaCol = list.columns.some((c) => c.name === QUOTA_USAGE_COLUMN);
  const rawQuotaState = state.filters[QUOTA_STATE_FILTER_KEY];
  const quotaState = hasQuotaCol && isQuotaStateFilter(rawQuotaState) ? rawQuotaState : null;

  const rawTimeRange = state.filters[LOG_TIME_RANGE_KEY];
  const timeRange = objectName === 'x:Log' && isLogTimeRange(rawTimeRange) ? rawTimeRange : null;

  const clientFilters: ClientEnumCriterion[] = [];
  for (const filter of (list.filters ?? []) as Filter[]) {
    if (!isClientOnlyFilterEnum(filter)) continue;
    const val = state.filters[filter.field];
    if (val) clientFilters.push({ field: filter.field, value: val });
  }

  // Request hidden/derived JMAP fields needed by client filters even when absent from list columns.
  const required = new Set<string>();
  if (quotaState) {
    required.add('usedDiskQuota');
    required.add('quotas');
  }
  if (timeRange) required.add('timestamp');
  for (const { field } of clientFilters) required.add(field);

  const client = clientSort !== null || quotaState !== null || timeRange !== null || clientFilters.length > 0;

  return {
    client,
    clientSort,
    quotaState,
    timeRange,
    clientFilters,
    requiredProperties: [...required],
  };
}

function parseTimestampMs(raw: unknown): number | null {
  if (typeof raw !== 'string' || !raw) return null;
  const ms = Date.parse(raw);
  return Number.isNaN(ms) ? null : ms;
}

function matchesQuotaState(row: ListItem, state: QuotaStateFilter): boolean {
  const { used, limit } = computeQuotaUsage(row);
  if (state === 'negative') return used < 0;
  if (used < 0 || limit <= 0) return false;
  if (state === 'over') return used >= limit;
  return used / limit >= 0.8;
}

/** Sorts the full row set in memory according to the active client sort column. */
export function sortClientRows(rows: ListItem[], sort: { field: string; ascending: boolean } | null): ListItem[] {
  if (!sort) return rows;
  const direction = sort.ascending ? 1 : -1;
  const { field } = sort;
  return [...rows].sort((a, b) => {
    const av = getClientSortValue(field, a);
    const bv = getClientSortValue(field, b);
    const cmp = typeof av === 'number' && typeof bv === 'number' ? av - bv : String(av).localeCompare(String(bv));
    return cmp * direction;
  });
}

/** Applies all client-side filters (`quotaState`, log `timeRange`, client enum filters) and sorting. */
export function processClientRows(rows: ListItem[], plan: ClientModePlan, nowMs = Date.now()): ListItem[] {
  const cutoff = plan.timeRange ? nowMs - RANGE_MS[plan.timeRange] : null;

  const filtered =
    plan.quotaState || cutoff !== null || plan.clientFilters.length > 0
      ? rows.filter((row) => {
          if (plan.quotaState && !matchesQuotaState(row, plan.quotaState)) return false;
          if (cutoff !== null) {
            const ts = parseTimestampMs(row.timestamp);
            if (ts === null || ts < cutoff) return false;
          }
          for (const { field, value } of plan.clientFilters) {
            if (String(row[field] ?? '') !== value) return false;
          }
          return true;
        })
      : rows;

  return sortClientRows(filtered, plan.clientSort);
}

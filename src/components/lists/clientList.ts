/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { isClientSortableColumn } from '@/lib/schemaDeviationTypes';
import { getClientSortValue } from '@/lib/syntheticColumns';
import type { List } from '@/types/schema';
import type { ListItem } from './listQuery';
import type { ListUrlState } from './listUrlState';

export interface ClientSortPlan {
  /** True when the active sort targets a client-only column and rows must be sorted locally. */
  client: boolean;
  clientSort: { field: string; ascending: boolean } | null;
}

/** Checks whether a list column is configured for browser-side sorting. */
export function isClientSortField(list: Pick<List, 'columns'>, field: string): boolean {
  return list.columns.some((c) => c.name === field && isClientSortableColumn(c));
}

/**
 * Determines whether the current list state needs fetch-all + local sorting.
 * Server-sortable columns keep normal cursor/position pagination.
 */
export function planClientMode(list: Pick<List, 'columns'>, state: ListUrlState): ClientSortPlan {
  const clientSort = state.sort && isClientSortField(list, state.sort.field) ? state.sort : null;
  return {
    client: clientSort !== null,
    clientSort,
  };
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

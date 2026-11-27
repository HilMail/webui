/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';

import { useJmapListAll } from '@/data/listAll';
import { useJmapList } from '@/data/objects';
import { errorMessage } from '@/lib/jmapErrors';
import { isClientOnlyFilterEnum } from '@/lib/logFilters';
import { JmapMethodError } from '@/services/errors';
import type { List } from '@/types/schema';
import {
  LOG_TIME_RANGE_KEY,
  QUOTA_STATE_FILTER_KEY,
  isClientSortField,
  planClientMode,
  processClientRows,
} from './clientList';
import {
  LIST_PAGE_SIZE,
  buildListFilter,
  buildListPageParams,
  buildListSort,
  isStrandedPage,
  itemId,
  pageRange,
  serverSort,
  type ListItem,
  type PageRange,
} from './listQuery';
import { listStateKey, nextSort, parseListSearch, serializeListSearch, type ListUrlState } from './listUrlState';

const EMPTY_ITEMS: ListItem[] = [];
const EMPTY_LIST: Pick<List, 'filters' | 'filtersStatic' | 'columns' | 'sort'> = { columns: [] };

export interface DynamicListState {
  state: ListUrlState;
  stateKey: string;
  items: ListItem[];
  total: number | null;
  range: PageRange;
  jmapFilter: Record<string, unknown> | undefined;
  jmapSort: Record<string, unknown>[] | undefined;
  /** True when rows are fetched in full and sorted/paginated in the browser. */
  clientMode: boolean;
  /** Full matching row set when clientMode is active. */
  allRows: ListItem[] | null;
  isLoading: boolean;
  isFetching: boolean;
  error: string | null;
  applyFilters: (filters: Record<string, string>) => void;
  resetFilters: () => void;
  clearClientOverrides: () => void;
  toggleSort: (field: string) => void;
  nextPage: () => void;
  prevPage: () => void;
  refetch: () => void;
}

export function useDynamicList(
  objectName: string | undefined,
  list: List | null | undefined,
  labelProperty?: string,
): DynamicListState {
  const [searchParams, setSearchParams] = useSearchParams();
  const state = parseListSearch(searchParams);
  const stateKey = listStateKey(state);
  const effectiveList = list ?? EMPTY_LIST;
  const enabledObject = list && objectName ? objectName : null;

  const plan = planClientMode(effectiveList, objectName ?? '', state);
  const pageParams = buildListPageParams(state, effectiveList, objectName ?? '', LIST_PAGE_SIZE, labelProperty);
  const allProperties =
    plan.requiredProperties.length > 0 && pageParams.properties
      ? [...new Set([...pageParams.properties, ...plan.requiredProperties])]
      : pageParams.properties;

  // Freeze the last non-client JMAP query params so entering client mode (or hitting the 10k-row guard)
  // retains the server-paginated table rows in cache instead of blanking to "No results found".
  const pageParamsKey = JSON.stringify(pageParams);
  const [lastServerQuery, setLastServerQuery] = useState(() => ({
    key: pageParamsKey,
    params: pageParams,
    anchorsCount: state.anchors.length,
  }));
  if (!plan.client && lastServerQuery.key !== pageParamsKey) {
    setLastServerQuery({
      key: pageParamsKey,
      params: pageParams,
      anchorsCount: state.anchors.length,
    });
  }

  const query = useJmapList(enabledObject, plan.client ? lastServerQuery.params : pageParams, {
    keepPrevious: true,
    enabled: !plan.client,
  });

  // When client-only sorting or filtering is active, pull matching rows once and filter/sort/slice locally.
  const allQuery = useJmapListAll(plan.client ? enabledObject : null, {
    filter: pageParams.filter,
    sort: pageParams.sort,
    properties: allProperties,
  });
  const sortedRows = plan.client && allQuery.data ? processClientRows(allQuery.data, plan) : null;

  const anchorLost =
    !plan.client &&
    state.anchors.length > 0 &&
    query.error instanceof JmapMethodError &&
    query.error.type === 'anchorNotFound' &&
    !query.isFetching;

  const active = plan.client ? allQuery : query;
  const usingServerFallback = plan.client && sortedRows === null && !!query.data;
  let items: ListItem[];
  let total: number | null;
  let startPosition: number;
  let anchorsCount = state.anchors.length;
  if (plan.client && !usingServerFallback) {
    const rows = sortedRows ?? EMPTY_ITEMS;
    const lastAnchor = state.anchors[state.anchors.length - 1];
    const anchorIndex = lastAnchor ? rows.findIndex((row) => itemId(row) === lastAnchor) : -1;
    startPosition = lastAnchor ? (anchorIndex === -1 ? rows.length : anchorIndex + 1) : 0;
    items = rows.slice(startPosition, startPosition + LIST_PAGE_SIZE);
    total = sortedRows ? rows.length : null;
  } else {
    items = query.data?.list ?? EMPTY_ITEMS;
    total = query.data?.total ?? null;
    startPosition = query.data?.position ?? 0;
    if (usingServerFallback) anchorsCount = lastServerQuery.anchorsCount;
  }

  const stranded = isStrandedPage(
    state.anchors.length,
    items.length,
    active.isSuccess && !active.isPlaceholderData && !active.isFetching,
  );
  const recovery = anchorLost ? 'reset' : stranded ? 'back' : null;

  useEffect(() => {
    if (!recovery) return;
    const current = parseListSearch(searchParams);
    const anchors = recovery === 'reset' ? [] : current.anchors.slice(0, -1);
    setSearchParams(serializeListSearch({ ...current, anchors }), { replace: true });
  }, [recovery, searchParams, setSearchParams]);

  const navigateTo = (next: ListUrlState) => {
    const params = serializeListSearch(next);
    if (params.toString() === stateKey) void active.refetch();
    else setSearchParams(params);
  };

  const clearClientOverrides = () => {
    const nextFilters = { ...state.filters };
    delete nextFilters[QUOTA_STATE_FILTER_KEY];
    delete nextFilters[LOG_TIME_RANGE_KEY];
    for (const f of effectiveList.filters ?? []) {
      if (isClientOnlyFilterEnum(f)) delete nextFilters[f.field];
    }
    const nextSortState = state.sort && isClientSortField(effectiveList, state.sort.field) ? null : state.sort;
    navigateTo({ filters: nextFilters, sort: nextSortState, anchors: [] });
  };

  return {
    state,
    stateKey,
    items,
    total,
    range: pageRange(startPosition, items.length, total, anchorsCount, LIST_PAGE_SIZE),
    jmapFilter: buildListFilter(state.filters, effectiveList, objectName ?? ''),
    jmapSort: buildListSort(serverSort(state.sort, effectiveList)),
    clientMode: plan.client,
    allRows: sortedRows,
    isLoading: active.isPending && active.fetchStatus !== 'idle',
    isFetching: active.isFetching,
    error: active.isError && !anchorLost ? errorMessage(active.error) : null,
    applyFilters: (filters) => navigateTo({ filters, sort: state.sort, anchors: [] }),
    resetFilters: () => navigateTo({ filters: {}, sort: null, anchors: [] }),
    clearClientOverrides,
    toggleSort: (field) => navigateTo({ filters: state.filters, sort: nextSort(state.sort, field), anchors: [] }),
    nextPage: () => {
      const last = items.length > 0 ? itemId(items[items.length - 1]) : null;
      if (last) navigateTo({ ...state, anchors: [...state.anchors, last] });
    },
    prevPage: () => {
      if (state.anchors.length > 0) navigateTo({ ...state, anchors: state.anchors.slice(0, -1) });
    },
    refetch: () => void active.refetch(),
  };
}

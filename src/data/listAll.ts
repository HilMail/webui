/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useQuery } from '@tanstack/react-query';
import i18n from '@/i18n';
import { jmapKeys, type ListPageParams } from '@/data/keys';
import { toast } from '@/hooks/use-toast';
import { FETCH_ALL_HARD_CAP, evaluateFetchAllTotal, probeQueryTotal } from '@/lib/fetchAllGuardrails';
import { jmapQueryAllAndGet, type JmapObject } from '@/services/jmap/client';

/**
 * Fetches all rows matching the current server filter when client-side sorting
 * is active, guarded by `fetchAllGuardrails` to prevent OOM on huge directories.
 */
export function fetchAllRowsQuery(objectName: string, params: ListPageParams) {
  const { properties, ...query } = params;
  return {
    queryKey: [...jmapKeys.lists(objectName), 'all', params] as const,
    staleTime: 0,
    queryFn: async ({ signal }: { signal: AbortSignal }): Promise<JmapObject[]> => {
      const probe = evaluateFetchAllTotal(await probeQueryTotal(objectName, query, signal));
      if (!probe.ok) {
        throw new Error(
          i18n.t(
            'list.fetchAllHardCap',
            'Refusing to load {{count}} matching rows into the browser (limit {{cap}}). Narrow filters to sort this column.',
            { count: probe.total, cap: FETCH_ALL_HARD_CAP },
          ),
        );
      }
      if (probe.warn) {
        toast({
          title: i18n.t('list.fetchAllWarn', 'Loading {{count}} rows into the browser — this may be slow.', {
            count: probe.total,
          }),
        });
      }
      const { list } = await jmapQueryAllAndGet(objectName, query, properties, { signal });
      return list;
    },
  };
}

/** React Query hook for full-list fetching behind client-side sorting. */
export function useJmapListAll(objectName: string | null | undefined, params: ListPageParams) {
  return useQuery({
    ...fetchAllRowsQuery(objectName ?? '', params),
    enabled: !!objectName,
    placeholderData: (previous) => previous,
  });
}

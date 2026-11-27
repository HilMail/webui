/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { jmapQuery } from '@/services/jmap/client';

/** Soft warning threshold: fetch proceeds, but warn that browser sorting may feel slow. */
export const FETCH_ALL_WARN_THRESHOLD = 2000;

/** Hard stop: refuse to pull huge directory sets into browser memory for client sorting. */
export const FETCH_ALL_HARD_CAP = 10_000;

export type FetchAllProbe =
  { ok: true; total: number; warn: boolean } | { ok: false; total: number; reason: 'hard-cap' };

/** Evaluates whether a fetch-all query is safe to materialize in browser memory. */
export function evaluateFetchAllTotal(total: number): FetchAllProbe {
  if (total > FETCH_ALL_HARD_CAP) {
    return { ok: false, total, reason: 'hard-cap' };
  }
  return { ok: true, total, warn: total > FETCH_ALL_WARN_THRESHOLD };
}

/**
 * Probes the matching row count with `limit: 1` before committing to `jmapQueryAllAndGet`,
 * preventing accidental multi-megabyte downloads when sorting synthetic columns.
 */
export async function probeQueryTotal(
  objectType: string,
  queryOptions: { filter?: Record<string, unknown>; sort?: Record<string, unknown>[] } = {},
  signal?: AbortSignal,
): Promise<number> {
  const data = await jmapQuery(
    objectType,
    {
      filter: queryOptions.filter,
      sort: queryOptions.sort,
      limit: 1,
      position: 0,
      calculateTotal: true,
    },
    { signal },
  );
  return data.total ?? 0;
}

/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import type { OverviewCardDef } from '@/features/overview/cards';
import { certificateValidity } from '@/lib/certificateValidity';
import { reportHasProblems } from '@/lib/reportSummaries';
import { resolveObject } from '@/lib/schemaResolver';
import { getAccountId, jmapGetBatched, jmapQuery, jmapQueryAllAndGet, jmapRequest } from '@/services/jmap/client';
import type { JmapMethodCall, JmapQueryResponse } from '@/types/jmap';
import type { Schema } from '@/types/schema';

/** Stay comfortably below Stalwart's default maxCallsInRequest limit (16). */
const QUERY_BATCH_SIZE = 12;
/** Cap recent report inspection so Overview stays cheap on busy deployments. */
const REPORT_SAMPLE_LIMIT = 25;

export type CardTotalStatus = 'ok' | 'unavailable';
export type CardTotalUnavailableReason = 'requestFailed' | 'queryRejected' | 'missingTotal';
export type AttentionLevel = 'none' | 'warn' | 'danger';

export interface CardTotal {
  status: CardTotalStatus;
  unavailableReason?: CardTotalUnavailableReason;
  total?: number;
  valid?: number;
  expired?: number;
  expiringSoon?: number;
  problemCount?: number;
  sampleSize?: number;
}

export interface ResolvedOverviewCard extends OverviewCardDef {
  objectType: string;
  permissionPrefix: string;
  href: string;
}

/** Filters overview cards to schema objects the current admin is allowed to query. */
export function resolveQueryableCards(
  schema: Schema,
  cards: OverviewCardDef[],
  viewToSection: Record<string, string>,
  canQuery: (permissionPrefix: string) => boolean,
): ResolvedOverviewCard[] {
  const out: ResolvedOverviewCard[] = [];

  for (const card of cards) {
    const obj = resolveObject(schema, card.viewName);
    if (!obj) continue;
    if (!canQuery(obj.permissionPrefix)) continue;

    const section = viewToSection[card.viewName] ?? 'Management';
    out.push({
      ...card,
      objectType: obj.objectName,
      permissionPrefix: obj.permissionPrefix,
      href: `/${section}/${card.viewName}`,
    });
  }

  return out;
}

export function deriveAttention(card: OverviewCardDef, total: CardTotal | undefined): AttentionLevel {
  if (!total || total.status !== 'ok') return 'none';

  if (card.enrich === 'queueAttention' && typeof total.total === 'number' && total.total > 0) {
    return 'warn';
  }

  if (card.enrich === 'certificateValidity') {
    if ((total.expired ?? 0) > 0) return 'danger';
    if ((total.expiringSoon ?? 0) > 0) return 'warn';
  }

  if (card.enrich === 'reportProblems' && (total.problemCount ?? 0) > 0) {
    return 'danger';
  }

  return 'none';
}

/**
 * Fetches server-side totals with `limit: 1, calculateTotal: true` so large directories
 * (e.g. 20k+ users) never transfer row payloads, then runs best-effort enrichment for certs and reports.
 */
export async function fetchCardTotals(
  cards: ResolvedOverviewCard[],
  signal?: AbortSignal,
): Promise<Record<string, CardTotal>> {
  const totals: Record<string, CardTotal> = {};
  if (cards.length === 0) return totals;

  for (let offset = 0; offset < cards.length; offset += QUERY_BATCH_SIZE) {
    if (signal?.aborted) break;
    const batch = cards.slice(offset, offset + QUERY_BATCH_SIZE);
    const methodCalls: JmapMethodCall[] = batch.map((card, index) => {
      const accountId = getAccountId(card.objectType);
      const args: Record<string, unknown> = {
        accountId,
        limit: 1,
        position: 0,
        calculateTotal: true,
      };
      if (card.filter) args.filter = card.filter;
      return [`${card.objectType}/query`, args, String(index)];
    });

    let responses;
    try {
      responses = await jmapRequest(methodCalls, signal);
    } catch {
      for (const card of batch) {
        totals[card.id] = { status: 'unavailable', unavailableReason: 'requestFailed' };
      }
      continue;
    }

    const byCallId = new Map(responses.map((r) => [r[2], r]));
    for (let i = 0; i < batch.length; i++) {
      const card = batch[i];
      const response = byCallId.get(String(i));
      if (!response || response[0] === 'error') {
        totals[card.id] = { status: 'unavailable', unavailableReason: 'queryRejected' };
        continue;
      }
      const body = response[1] as unknown as JmapQueryResponse;
      const total = typeof body.total === 'number' ? body.total : body.ids?.length;
      if (typeof total !== 'number') {
        totals[card.id] = { status: 'unavailable', unavailableReason: 'missingTotal' };
        continue;
      }
      totals[card.id] = { status: 'ok', total };
    }
  }

  const certCard = cards.find((c) => c.enrich === 'certificateValidity');
  if (certCard && totals[certCard.id]?.status === 'ok' && !signal?.aborted) {
    try {
      const { list } = await jmapQueryAllAndGet(certCard.objectType, {}, ['notValidAfter'], { signal });
      const now = Date.now();
      let valid = 0;
      let expired = 0;
      let expiringSoon = 0;
      for (const item of list) {
        const status = certificateValidity(item.notValidAfter, now);
        if (status === 'expired') {
          expired += 1;
        } else {
          valid += 1;
          if (status === 'expiringSoon') expiringSoon += 1;
        }
      }
      totals[certCard.id] = { ...totals[certCard.id], valid, expired, expiringSoon };
    } catch {
      // Keep the baseline certificate count even if detail enrichment fails.
    }
  }

  const reportCards = cards.filter(
    (c) => c.enrich === 'reportProblems' && totals[c.id]?.status === 'ok' && (totals[c.id]?.total ?? 0) > 0,
  );
  for (const card of reportCards) {
    if (signal?.aborted) break;
    try {
      const queryResult = await jmapQuery(
        card.objectType,
        { limit: REPORT_SAMPLE_LIMIT, position: 0, calculateTotal: true },
        { signal },
      );
      const ids = (queryResult.ids ?? []).slice(0, REPORT_SAMPLE_LIMIT);
      if (ids.length === 0) {
        totals[card.id] = { ...totals[card.id], problemCount: 0, sampleSize: 0 };
        continue;
      }
      const list = await jmapGetBatched(card.objectType, ids, ['report'], { signal });
      const problemCount = list.filter((item) => reportHasProblems(card.viewName, item)).length;
      totals[card.id] = { ...totals[card.id], problemCount, sampleSize: list.length };
    } catch {
      // Keep the baseline report count if sampling fails.
    }
  }

  return totals;
}

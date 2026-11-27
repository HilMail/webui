/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { FETCH_ALL_HARD_CAP, FETCH_ALL_WARN_THRESHOLD, evaluateFetchAllTotal } from '@/lib/fetchAllGuardrails';

describe('evaluateFetchAllTotal', () => {
  it('allows normal directory sizes silently and warns above soft threshold', () => {
    expect(evaluateFetchAllTotal(100)).toEqual({ ok: true, total: 100, warn: false });
    expect(evaluateFetchAllTotal(FETCH_ALL_WARN_THRESHOLD)).toEqual({
      ok: true,
      total: FETCH_ALL_WARN_THRESHOLD,
      warn: false,
    });
    expect(evaluateFetchAllTotal(FETCH_ALL_WARN_THRESHOLD + 1)).toEqual({
      ok: true,
      total: FETCH_ALL_WARN_THRESHOLD + 1,
      warn: true,
    });
  });

  it('blocks browser-side fetch-all above hard cap to avoid OOM', () => {
    expect(evaluateFetchAllTotal(FETCH_ALL_HARD_CAP + 1)).toEqual({
      ok: false,
      total: FETCH_ALL_HARD_CAP + 1,
      reason: 'hard-cap',
    });
  });
});

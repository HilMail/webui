/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';

import { OVERVIEW_CARDS } from '@/features/overview/cards';
import { deriveAttention, fetchCardTotals, resolveQueryableCards } from '@/features/overview/fetchTotals';
import * as jmapClient from '@/services/jmap/client';
import type { Schema } from '@/types/schema';

vi.mock('@/services/jmap/client', () => ({
  getAccountId: (type: string) => (type === 'x:Domain' ? 'acc-1' : 'primary'),
  jmapRequest: vi.fn(),
  jmapQueryAllAndGet: vi.fn(),
  jmapQuery: vi.fn(),
  jmapGetBatched: vi.fn(),
}));

function minimalSchema(): Schema {
  return {
    objects: {
      'x:Account': { type: 'object', description: 'Account', permissionPrefix: 'sysAccount' },
      'x:Account/User': { type: 'view', objectName: 'x:Account' },
      'x:Domain': { type: 'object', description: 'Domain', permissionPrefix: 'sysDomain' },
      'x:Certificate': { type: 'object', description: 'Certificate', permissionPrefix: 'sysCert' },
      'x:DmarcExternalReport': { type: 'object', description: 'DMARC', permissionPrefix: 'sysReport' },
      'x:Metric': { type: 'object', description: 'Metric', permissionPrefix: 'sysMetric', enterprise: true },
    },
    schemas: {},
    fields: {},
    forms: {},
    lists: {},
    enums: {},
    dashboards: [],
    layouts: [],
  };
}

describe('overview fetchTotals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('filters cards by schema presence and Query permission', () => {
    const schema = minimalSchema();
    const viewToSection = { 'x:Account/User': 'directory', 'x:Domain': 'directory' };

    const cards = resolveQueryableCards(schema, OVERVIEW_CARDS, viewToSection, (prefix) =>
      ['sysAccount', 'sysDomain'].includes(prefix),
    );

    expect(cards.map((c) => c.id).sort()).toEqual(['domains', 'users']);
    expect(cards.find((c) => c.id === 'users')?.href).toBe('/directory/x:Account/User');
    expect(cards.find((c) => c.id === 'users')?.objectType).toBe('x:Account');
  });

  it('derives attention levels for queue backlog, certificate expiry, and report problems', () => {
    expect(deriveAttention({ enrich: 'queueAttention' } as never, { status: 'ok', total: 3 })).toBe('warn');
    expect(deriveAttention({ enrich: 'queueAttention' } as never, { status: 'ok', total: 0 })).toBe('none');
    expect(deriveAttention({ enrich: 'certificateValidity' } as never, { status: 'ok', total: 2, expired: 1 })).toBe(
      'danger',
    );
    expect(
      deriveAttention({ enrich: 'certificateValidity' } as never, {
        status: 'ok',
        total: 2,
        expired: 0,
        expiringSoon: 1,
      }),
    ).toBe('warn');
    expect(deriveAttention({ enrich: 'reportProblems' } as never, { status: 'ok', total: 10, problemCount: 2 })).toBe(
      'danger',
    );
  });

  it('queries server totals with limit 1 and enriches certificates and reports', async () => {
    const schema = minimalSchema();
    const cards = resolveQueryableCards(schema, OVERVIEW_CARDS, {}, () => true);

    vi.mocked(jmapClient.jmapRequest).mockResolvedValue([
      ['x:Account/query', { total: 19885, ids: ['u1'] }, '0'],
      ['x:Domain/query', { total: 12, ids: ['d1'] }, '1'],
      ['x:Certificate/query', { total: 3, ids: ['c1'] }, '2'],
      ['error', { type: 'invalidArguments' }, '3'],
    ]);

    const futureIso = new Date(Date.now() + 90 * 86_400_000).toISOString();
    const soonIso = new Date(Date.now() + 5 * 86_400_000).toISOString();
    const pastIso = new Date(Date.now() - 86_400_000).toISOString();
    vi.mocked(jmapClient.jmapQueryAllAndGet).mockResolvedValue({
      ids: ['c1', 'c2', 'c3'],
      list: [
        { id: 'c1', notValidAfter: futureIso },
        { id: 'c2', notValidAfter: soonIso },
        { id: 'c3', notValidAfter: pastIso },
      ],
    });

    const totals = await fetchCardTotals(cards);
    // Verify 20k-safe limit: 1 + calculateTotal: true query args are used instead of pulling rows.
    const callArgs = vi.mocked(jmapClient.jmapRequest).mock.calls[0][0];
    expect(callArgs[0][1]).toMatchObject({ limit: 1, position: 0, calculateTotal: true });

    expect(totals.users).toEqual({ status: 'ok', total: 19885 });
    expect(totals.domains).toEqual({ status: 'ok', total: 12 });
    expect(totals.certificates).toEqual({
      status: 'ok',
      total: 3,
      valid: 2,
      expired: 1,
      expiringSoon: 1,
    });
    expect(totals.dmarcExternal).toEqual({ status: 'unavailable', unavailableReason: 'queryRejected' });
  });
});

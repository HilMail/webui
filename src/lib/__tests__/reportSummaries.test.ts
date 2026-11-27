/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import {
  reportHasProblems,
  summarizeArfIncidents,
  summarizeDmarcDispositions,
  summarizeTlsSessions,
} from '@/lib/reportSummaries';

describe('reportSummaries', () => {
  it('summarizes DMARC pass/none, quarantine, and reject dispositions', () => {
    const report = {
      records: {
        r1: { count: 10, evaluatedDisposition: 'pass' },
        r2: { count: 4, evaluatedDisposition: 'none' },
        r3: { count: 2, evaluatedDisposition: 'quarantine' },
        r4: { count: 1, evaluatedDisposition: 'reject' },
      },
    };
    expect(summarizeDmarcDispositions(report)).toEqual({ pass: 14, quarantine: 2, reject: 1 });
    expect(reportHasProblems('x:DmarcExternalReport', { report })).toBe(true);
    expect(
      reportHasProblems('x:DmarcInternalReport', {
        report: { records: { r1: { count: 5, evaluatedDisposition: 'pass' } } },
      }),
    ).toBe(false);
  });

  it('summarizes TLS successful/failed sessions and flags failed sessions', () => {
    const report = {
      policies: {
        p1: { totalSuccessfulSessions: 40, totalFailedSessions: 0 },
        p2: { totalSuccessfulSessions: 5, totalFailedSessions: 3 },
      },
    };
    expect(summarizeTlsSessions(report)).toEqual({ successful: 45, failed: 3 });
    expect(reportHasProblems('x:TlsExternalReport', { report })).toBe(true);
    expect(
      reportHasProblems('x:TlsInternalReport', {
        report: { policies: { p1: { totalSuccessfulSessions: 8, totalFailedSessions: 0 } } },
      }),
    ).toBe(false);
  });

  it('summarizes ARF incident counts', () => {
    expect(summarizeArfIncidents({ incidents: 4 })).toBe(4);
    expect(reportHasProblems('x:ArfExternalReport', { report: { incidents: 2 } })).toBe(true);
    expect(reportHasProblems('x:ArfExternalReport', { report: { incidents: 0 } })).toBe(false);
  });
});

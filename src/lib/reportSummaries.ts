/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

function asRecord(value: unknown): Record<string, unknown> | null {
  return value != null && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : null;
}

/** Extracts objects stored in JMAP id-keyed `objectList` maps. */
function objectListEntries(value: unknown): Record<string, unknown>[] {
  const map = asRecord(value);
  if (!map) return [];
  return Object.values(map).filter((v): v is Record<string, unknown> => asRecord(v) != null);
}

function recordCount(record: Record<string, unknown>): number {
  return typeof record.count === 'number' ? record.count : 0;
}

/**
 * Aggregates DMARC evaluated dispositions across report records.
 * `none` counts alongside `pass` since DMARC did not quarantine or reject.
 */
export function summarizeDmarcDispositions(report: unknown): {
  pass: number;
  quarantine: number;
  reject: number;
} {
  const root = asRecord(report);
  const totals = { pass: 0, quarantine: 0, reject: 0 };
  if (!root) return totals;

  for (const record of objectListEntries(root.records)) {
    const n = recordCount(record);
    const disposition = String(record.evaluatedDisposition ?? '').toLowerCase();
    if (disposition === 'pass' || disposition === 'none') {
      totals.pass += n;
    } else if (disposition === 'quarantine') {
      totals.quarantine += n;
    } else if (disposition === 'reject') {
      totals.reject += n;
    }
  }
  return totals;
}

/** Sums successful and failed TLS sessions across every policy in a TLS report. */
export function summarizeTlsSessions(report: unknown): {
  successful: number;
  failed: number;
} {
  const root = asRecord(report);
  const totals = { successful: 0, failed: 0 };
  if (!root) return totals;

  for (const policy of objectListEntries(root.policies)) {
    if (typeof policy.totalSuccessfulSessions === 'number') {
      totals.successful += policy.totalSuccessfulSessions;
    }
    if (typeof policy.totalFailedSessions === 'number') {
      totals.failed += policy.totalFailedSessions;
    }
  }
  return totals;
}

export function summarizeArfIncidents(report: unknown): number {
  const root = asRecord(report);
  return typeof root?.incidents === 'number' ? root.incidents : 0;
}

/**
 * Returns true when a DMARC, TLS, or ARF report contains quarantined/rejected messages,
 * failed TLS sessions, or abuse incidents so Overview can surface an attention alert.
 */
export function reportHasProblems(viewName: string, item: Record<string, unknown>): boolean {
  const report = item.report;
  if (viewName.includes('Dmarc')) {
    const d = summarizeDmarcDispositions(report);
    return d.quarantine > 0 || d.reject > 0;
  }
  if (viewName.includes('Tls')) {
    return summarizeTlsSessions(report).failed > 0;
  }
  if (viewName.includes('Arf')) {
    return summarizeArfIncidents(report) > 0;
  }
  return false;
}

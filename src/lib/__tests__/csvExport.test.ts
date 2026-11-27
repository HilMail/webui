/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { buildCsv, escapeCsvField } from '@/lib/csvExport';

describe('escapeCsvField', () => {
  it.each(['=1+1', '+SUM(A1)', '-1+2', '@SUM(A1)', '＝1+1', '＋1+2', '－1+2', '＠SUM(A1)', '  =1+1', '\t@SUM(A1)'])(
    'guards formula-like values against spreadsheet execution: %s',
    (value) => {
      expect(escapeCsvField(value)).toBe(`"'${value}"`);
    },
  );

  it('quotes every field and doubles embedded quotes', () => {
    expect(escapeCsvField('a,"b"')).toBe('"a,""b"""');
    expect(escapeCsvField('')).toBe('""');
  });

  it('preserves ordinary identifiers cleanly', () => {
    expect(escapeCsvField('alice@hilmail.co')).toBe('"alice@hilmail.co"');
    expect(escapeCsvField('42')).toBe('"42"');
  });
});

describe('buildCsv', () => {
  it('formats quoted RFC 4180 CRLF output', () => {
    expect(buildCsv(['Name', 'Value'], [['Alice', '=1+1']])).toBe('"Name","Value"\r\n"Alice","\'=1+1"');
  });

  it('preserves commas and line breaks inside quoted cells', () => {
    expect(buildCsv(['Name'], [['line one,\nline two']])).toBe('"Name"\r\n"line one,\nline two"');
  });
});

/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

/**
 * Quote every CSV field for consistent RFC 4180 output and guard against spreadsheet
 * formula injection by prefixing formula starter characters with a leading apostrophe.
 */
export function escapeCsvField(value: string): string {
  const spreadsheetSafeValue = /^[\s\uFEFF]*[=+\-@＝＋－＠]/u.test(value) ? `'${value}` : value;
  return `"${spreadsheetSafeValue.replace(/"/g, '""')}"`;
}

export function buildCsv(headers: string[], rows: string[][]): string {
  const lines = [headers, ...rows].map((row) => row.map(escapeCsvField).join(','));
  // CRLF line endings ensure strict RFC 4180 compliance and clean Excel imports.
  return lines.join('\r\n');
}

export function downloadCsv(filename: string, csvContent: string): void {
  // Prepend UTF-8 BOM so Excel decodes non-ASCII display names and symbols cleanly.
  const blob = new Blob(['\uFEFF', csvContent], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

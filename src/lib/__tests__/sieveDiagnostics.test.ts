/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { checkSieveSyntax, computeLineDiff } from '@/lib/sieveDiagnostics';

describe('sieveDiagnostics', () => {
  it('validates clean scripts while ignoring delimiters inside strings, comments, and text: blocks', () => {
    const script = [
      '# header comment with { unmatched brace',
      '/* block comment [ ] ( ) */',
      'require ["envelope", "variables"];',
      'if envelope :is "from" "user{1}@example.com" {',
      '  vacation :text text:',
      'Unmatched { inside multiline payload',
      '.',
      ';',
      '}',
    ].join('\n');

    expect(checkSieveSyntax(script)).toEqual({ status: 'ok', issues: [] });
    expect(checkSieveSyntax('   \n  ')).toEqual({ status: 'empty', issues: [] });
  });

  it('reports accurate line numbers for unclosed blocks, strings, comments, and text: literals', () => {
    expect(checkSieveSyntax('if true {\n  keep;')).toEqual({
      status: 'error',
      issues: [{ line: 1, message: 'Unclosed "{" on line 1 (missing "}")' }],
    });

    expect(checkSieveSyntax('require ["log"];\n}')).toEqual({
      status: 'error',
      issues: [{ line: 2, message: 'Unexpected "}" on line 2' }],
    });

    expect(checkSieveSyntax('reject "unclosed\nline 2;')).toEqual({
      status: 'error',
      issues: [{ line: 1, message: 'Unclosed string literal started on line 1' }],
    });

    expect(checkSieveSyntax('/* started\nstill open')).toEqual({
      status: 'error',
      issues: [{ line: 1, message: 'Unclosed block comment started on line 1' }],
    });

    expect(checkSieveSyntax('vacation text:\nHello world')).toEqual({
      status: 'error',
      issues: [{ line: 1, message: 'Unclosed text: block started on line 1 (missing ".")' }],
    });
  });

  it('computes minimal line diffs and counts for changed Sieve policies', () => {
    const baseline = ['require ["log"];', 'if size :over 5M {', '  keep;', '}'].join('\n');
    const current = ['require ["log"];', 'if size :over 10M {', '  reject "too big";', '}'].join('\n');

    const diff = computeLineDiff(baseline, current);
    expect(diff.added).toBe(2);
    expect(diff.removed).toBe(2);
    expect(diff.entries).toEqual([
      { type: 'unchanged', text: 'require ["log"];', oldLine: 1, newLine: 1 },
      { type: 'removed', text: 'if size :over 5M {', oldLine: 2 },
      { type: 'removed', text: '  keep;', oldLine: 3 },
      { type: 'added', text: 'if size :over 10M {', newLine: 2 },
      { type: 'added', text: '  reject "too big";', newLine: 3 },
      { type: 'unchanged', text: '}', oldLine: 4, newLine: 4 },
    ]);
  });
});

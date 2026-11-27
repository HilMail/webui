/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { StringStream } from '@codemirror/language';
import { describe, expect, it } from 'vitest';

import { sieveLanguage, tokenizeSieve, type SieveParserState } from '@/lib/sieveLanguage';

function tokenizeScript(source: string): Array<{ text: string; token: string | null }> {
  const lines = source.split('\n');
  const state: SieveParserState = {
    inBlockComment: false,
    inMultilineText: false,
    inString: false,
  };
  const out: Array<{ text: string; token: string | null }> = [];
  for (const line of lines) {
    const stream = new StringStream(line, 2, 2);
    while (!stream.eol()) {
      stream.start = stream.pos;
      const token = tokenizeSieve(stream, state);
      out.push({ text: stream.current(), token });
    }
  }
  return out;
}

describe('sieveLanguage tokenizer', () => {
  it('registers StreamLanguage with hash and block comment metadata', () => {
    expect(sieveLanguage.name).toBe('sieve');
  });

  it('tokenizes MTA policy keywords, tests, tags, comments, strings, sizes, and variables', () => {
    const tokens = tokenizeScript(`# hilmail-reputation-sender-guard
/* block
   comment */
require ["envelope", "variables"];
if allof (envelope :domain :is "from" "blocked.example", size :over 500K) {
  log "Blocked \${env.sender}";
  reject text:
Policy rejection line
.
;
}`);

    expect(tokens).toContainEqual({ text: '# hilmail-reputation-sender-guard', token: 'comment' });
    expect(tokens).toContainEqual({ text: '/* block', token: 'comment' });
    expect(tokens).toContainEqual({ text: '   comment */', token: 'comment' });
    expect(tokens).toContainEqual({ text: 'require', token: 'keyword' });
    expect(tokens).toContainEqual({ text: 'allof', token: 'keyword' });
    expect(tokens).toContainEqual({ text: 'envelope', token: 'builtin' });
    expect(tokens).toContainEqual({ text: ':domain', token: 'atom' });
    expect(tokens).toContainEqual({ text: ':is', token: 'atom' });
    expect(tokens).toContainEqual({ text: '"from"', token: 'string' });
    expect(tokens).toContainEqual({ text: '500K', token: 'number' });
    expect(tokens).toContainEqual({ text: 'log', token: 'builtin' });
    expect(tokens).toContainEqual({ text: 'text:', token: 'keyword' });
    expect(tokens).toContainEqual({ text: 'Policy rejection line', token: 'string' });
  });
});

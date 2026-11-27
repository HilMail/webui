/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { StreamLanguage, type StringStream } from '@codemirror/language';

/**
 * Core RFC 5228 control/action keywords plus common Sieve scripting extensions.
 */
export const SIEVE_KEYWORDS = new Set([
  'require',
  'if',
  'elsif',
  'else',
  'stop',
  'discard',
  'keep',
  'redirect',
  'reject',
  'ereject',
  'fileinto',
  'setflag',
  'addflag',
  'removeflag',
  'hasflag',
  'vacation',
  'notify',
  'set',
  'let',
  'eval',
  'while',
  'for',
  'return',
  'global',
  'import',
  'include',
  'foreverypart',
  'break',
  'not',
  'allof',
  'anyof',
  'true',
  'false',
]);

/**
 * Standard Sieve tests and Stalwart MTA policy / milter actions & builtins.
 */
export const SIEVE_BUILTINS = new Set([
  'address',
  'body',
  'comparator',
  'contains',
  'convert',
  'count',
  'currentdate',
  'date',
  'defer',
  'deleteheader',
  'domain',
  'envelope',
  'environment',
  'eq',
  'exists',
  'ge',
  'gt',
  'header',
  'is',
  'le',
  'localpart',
  'log',
  'lt',
  'matches',
  'ne',
  'over',
  'quarantine',
  'regex',
  'relational',
  'replaceheader',
  'size',
  'spamtest',
  'tempfail',
  'under',
  'user',
  'value',
  'virustest',
  'accept',
  'addheader',
]);

export interface SieveParserState {
  inBlockComment: boolean;
  inMultilineText: boolean;
  inString: boolean;
}

/**
 * Consumes one token from a CodeMirror `StringStream` for Sieve & Stalwart MTA scripts.
 */
export function tokenizeSieve(stream: StringStream, state: SieveParserState): string | null {
  // Inside a `text:` multi-line literal, everything until a lone `.` line is string content.
  if (state.inMultilineText) {
    if (stream.sol() && stream.match(/\.\s*$/)) {
      state.inMultilineText = false;
      return 'string';
    }
    stream.skipToEnd();
    return 'string';
  }

  // Continue /* ... */ block comments across line boundaries.
  if (state.inBlockComment) {
    if (stream.match(/^.*?\*\//)) {
      state.inBlockComment = false;
    } else {
      stream.skipToEnd();
    }
    return 'comment';
  }

  // Continue multi-line quoted strings across newlines cleanly.
  if (state.inString) {
    while (!stream.eol()) {
      const ch = stream.next();
      if (ch === '\\') {
        stream.next();
      } else if (ch === '"') {
        state.inString = false;
        break;
      }
    }
    return 'string';
  }

  if (stream.eatSpace()) return null;

  // `#` starts an end-of-line Sieve hash comment.
  if (stream.peek() === '#') {
    stream.skipToEnd();
    return 'comment';
  }

  if (stream.match('/*')) {
    if (!stream.match(/^.*?\*\//)) {
      state.inBlockComment = true;
      stream.skipToEnd();
    }
    return 'comment';
  }

  if (stream.peek() === '"') {
    stream.next();
    let closed = false;
    while (!stream.eol()) {
      const ch = stream.next();
      if (ch === '\\') {
        stream.next();
      } else if (ch === '"') {
        closed = true;
        break;
      }
    }
    if (!closed) state.inString = true;
    return 'string';
  }

  // RFC 5228 `text:` multi-line literal begins the body on the next line.
  if (stream.match(/^text:(?=\s*(#.*)?$)/i)) {
    state.inMultilineText = true;
    return 'keyword';
  }

  // Sieve variable substitutions such as `${env.sender}` or `${1}`.
  if (stream.match(/^\$\{[^}]+\}/)) {
    return 'variableName';
  }

  // Tagged parameters such as `:matches`, `:is`, `:over`, `:comparator`.
  if (stream.match(/^:[A-Za-z_][A-Za-z0-9_-]*/)) {
    return 'atom';
  }

  // Integer counts or byte sizes with RFC 5228 suffixes (`K`, `M`, `G`).
  if (stream.match(/^\d+[KMGkmg]?\b/)) {
    return 'number';
  }

  if (stream.match(/^[{}()[\],;]/)) {
    return 'bracket';
  }

  if (stream.match(/^(==|!=|<=|>=|=~|!~|[=!<>+\-*/])/)) {
    return 'operator';
  }

  if (stream.match(/^[A-Za-z_][A-Za-z0-9_.-]*/)) {
    const word = stream.current().toLowerCase();
    if (SIEVE_KEYWORDS.has(word)) return 'keyword';
    if (SIEVE_BUILTINS.has(word)) return 'builtin';
    return 'variableName';
  }

  stream.next();
  return null;
}

/** CodeMirror 6 StreamLanguage instance configured for Sieve scripts and MTA policy expressions. */
export const sieveLanguage = StreamLanguage.define<SieveParserState>({
  name: 'sieve',
  startState: (): SieveParserState => ({
    inBlockComment: false,
    inMultilineText: false,
    inString: false,
  }),
  token: tokenizeSieve,
  languageData: {
    commentTokens: {
      line: '#',
      block: { open: '/*', close: '*/' },
    },
  },
});

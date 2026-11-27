/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

export interface SieveSyntaxIssue {
  line: number;
  message: string;
}

export interface SieveSyntaxResult {
  status: 'empty' | 'ok' | 'error';
  issues: SieveSyntaxIssue[];
}

export interface DiffLine {
  type: 'unchanged' | 'added' | 'removed';
  text: string;
  oldLine?: number;
  newLine?: number;
}

export interface LineDiffResult {
  entries: DiffLine[];
  added: number;
  removed: number;
}

export interface SieveSnippet {
  id: string;
  label: string;
  description: string;
  code: string;
}

/**
 * Curated RFC 5228 & Stalwart MTA policy snippets safe to copy into the clipboard without mutating live scripts.
 */
export const SIEVE_SNIPPETS: readonly SieveSnippet[] = [
  {
    id: 'require-mta',
    label: 'Require MTA extensions',
    description: 'Import envelope, variables, and log helpers',
    code: 'require ["envelope", "variables", "log"];',
  },
  {
    id: 'sender-domain-guard',
    label: 'Sender domain guard',
    description: 'Match envelope sender domain',
    code: 'if envelope :domain :is "from" "example.com" {\n  keep;\n}',
  },
  {
    id: 'size-reject',
    label: 'Reject oversized message',
    description: 'Block payloads above a size limit',
    code: 'if size :over 10M {\n  reject "550 5.3.4 Message exceeds maximum allowed size";\n}',
  },
  {
    id: 'defer-tempfail',
    label: 'Temporary defer (4xx)',
    description: 'Ask sending MTA to retry later',
    code: 'defer "451 4.7.1 Temporarily deferred by policy";',
  },
  {
    id: 'log-and-header',
    label: 'Audit log + header',
    description: 'Log match and tag the message',
    code: 'addheader "X-HilMail-Policy" "matched";\nlog "Policy rule matched";',
  },
];

const OPENING_FOR: Record<string, string> = {
  '}': '{',
  ']': '[',
  ')': '(',
};

const EXPECTED_CLOSING: Record<string, string> = {
  '{': '}',
  '[': ']',
  '(': ')',
};

/**
 * Lightweight lexical/delimiter validator for Sieve and Stalwart MTA scripts.
 * Skips comments, quoted strings, and RFC 5228 `text:` multi-line blocks so braces inside payloads do not trigger false positives.
 */
export function checkSieveSyntax(source: string): SieveSyntaxResult {
  if (source.trim().length === 0) {
    return { status: 'empty', issues: [] };
  }

  const stack: Array<{ char: string; line: number }> = [];
  let line = 1;
  let i = 0;

  while (i < source.length) {
    const ch = source[i];
    const next = source[i + 1];

    if (ch === '\n') {
      line += 1;
      i += 1;
      continue;
    }

    // End-of-line `#` comment.
    if (ch === '#') {
      while (i < source.length && source[i] !== '\n') i += 1;
      continue;
    }

    // Multi-line `/* ... */` block comment.
    if (ch === '/' && next === '*') {
      const startLine = line;
      i += 2;
      let closed = false;
      while (i < source.length) {
        if (source[i] === '\n') line += 1;
        if (source[i] === '*' && source[i + 1] === '/') {
          i += 2;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) {
        return {
          status: 'error',
          issues: [{ line: startLine, message: `Unclosed block comment started on line ${startLine}` }],
        };
      }
      continue;
    }

    // Double-quoted Sieve string with backslash escapes.
    if (ch === '"') {
      const startLine = line;
      i += 1;
      let closed = false;
      while (i < source.length) {
        const cur = source[i];
        if (cur === '\\') {
          if (source[i + 1] === '\n') line += 1;
          i += 2;
          continue;
        }
        if (cur === '\n') line += 1;
        if (cur === '"') {
          i += 1;
          closed = true;
          break;
        }
        i += 1;
      }
      if (!closed) {
        return {
          status: 'error',
          issues: [{ line: startLine, message: `Unclosed string literal started on line ${startLine}` }],
        };
      }
      continue;
    }

    // Detect `text:` multi-line literal when `text:` sits on a token boundary followed only by optional whitespace/#comment to EOL.
    if ((ch === 't' || ch === 'T') && source.slice(i, i + 5).toLowerCase() === 'text:') {
      const prev = i > 0 ? source[i - 1] : '';
      const onBoundary = i === 0 || /[\s;{}()[\],]/.test(prev);
      if (onBoundary) {
        const lineEndIdx = source.indexOf('\n', i + 5);
        const restOfLine = lineEndIdx === -1 ? source.slice(i + 5) : source.slice(i + 5, lineEndIdx);
        if (/^\s*(?:#.*)?$/.test(restOfLine)) {
          const startLine = line;
          if (lineEndIdx === -1) {
            return {
              status: 'error',
              issues: [{ line: startLine, message: `Unclosed text: block started on line ${startLine} (missing ".")` }],
            };
          }
          i = lineEndIdx + 1;
          line += 1;
          let closed = false;
          while (i <= source.length) {
            const nextNl = source.indexOf('\n', i);
            const rawLine = nextNl === -1 ? source.slice(i) : source.slice(i, nextNl);
            const cleanLine = rawLine.endsWith('\r') ? rawLine.slice(0, -1) : rawLine;
            if (cleanLine === '.') {
              closed = true;
              if (nextNl === -1) {
                i = source.length;
              } else {
                i = nextNl + 1;
                line += 1;
              }
              break;
            }
            if (nextNl === -1) break;
            i = nextNl + 1;
            line += 1;
          }
          if (!closed) {
            return {
              status: 'error',
              issues: [{ line: startLine, message: `Unclosed text: block started on line ${startLine} (missing ".")` }],
            };
          }
          continue;
        }
      }
    }

    if (ch === '{' || ch === '[' || ch === '(') {
      stack.push({ char: ch, line });
    } else if (ch === '}' || ch === ']' || ch === ')') {
      const expected = OPENING_FOR[ch];
      const top = stack[stack.length - 1];
      if (!top || top.char !== expected) {
        return {
          status: 'error',
          issues: [{ line, message: `Unexpected "${ch}" on line ${line}` }],
        };
      }
      stack.pop();
    }

    i += 1;
  }

  if (stack.length > 0) {
    const unclosed = stack[stack.length - 1];
    return {
      status: 'error',
      issues: [
        {
          line: unclosed.line,
          message: `Unclosed "${unclosed.char}" on line ${unclosed.line} (missing "${EXPECTED_CLOSING[unclosed.char]}")`,
        },
      ],
    };
  }

  return { status: 'ok', issues: [] };
}

function splitNormalizedLines(text: string): string[] {
  if (text === '') return [];
  return text.replace(/\r\n/g, '\n').split('\n');
}

// Cap full quadratic DP size so huge multi-thousand-line scripts degrade safely to a block replacement diff.
const MAX_LCS_CELLS = 400_000;

/**
 * Computes a line-oriented diff between saved baseline and edited Sieve text.
 * Trims shared prefix/suffix lines first so typical localized edits stay near-linear time.
 */
export function computeLineDiff(baseline: string, current: string): LineDiffResult {
  const oldLines = splitNormalizedLines(baseline);
  const newLines = splitNormalizedLines(current);

  let prefix = 0;
  while (prefix < oldLines.length && prefix < newLines.length && oldLines[prefix] === newLines[prefix]) {
    prefix += 1;
  }

  let oldEnd = oldLines.length - 1;
  let newEnd = newLines.length - 1;
  while (oldEnd >= prefix && newEnd >= prefix && oldLines[oldEnd] === newLines[newEnd]) {
    oldEnd -= 1;
    newEnd -= 1;
  }

  const entries: DiffLine[] = [];
  for (let i = 0; i < prefix; i += 1) {
    entries.push({ type: 'unchanged', text: oldLines[i], oldLine: i + 1, newLine: i + 1 });
  }

  const midOld = oldLines.slice(prefix, oldEnd + 1);
  const midNew = newLines.slice(prefix, newEnd + 1);
  let added = 0;
  let removed = 0;

  if (midOld.length * midNew.length <= MAX_LCS_CELLS) {
    const m = midOld.length;
    const n = midNew.length;
    const dp = new Int32Array((m + 1) * (n + 1));
    const stride = n + 1;

    for (let i = m - 1; i >= 0; i -= 1) {
      for (let j = n - 1; j >= 0; j -= 1) {
        if (midOld[i] === midNew[j]) {
          dp[i * stride + j] = dp[(i + 1) * stride + (j + 1)] + 1;
        } else {
          const down = dp[(i + 1) * stride + j];
          const right = dp[i * stride + (j + 1)];
          dp[i * stride + j] = down >= right ? down : right;
        }
      }
    }

    let i = 0;
    let j = 0;
    while (i < m && j < n) {
      if (midOld[i] === midNew[j]) {
        entries.push({
          type: 'unchanged',
          text: midOld[i],
          oldLine: prefix + i + 1,
          newLine: prefix + j + 1,
        });
        i += 1;
        j += 1;
      } else if (dp[(i + 1) * stride + j] >= dp[i * stride + (j + 1)]) {
        entries.push({ type: 'removed', text: midOld[i], oldLine: prefix + i + 1 });
        removed += 1;
        i += 1;
      } else {
        entries.push({ type: 'added', text: midNew[j], newLine: prefix + j + 1 });
        added += 1;
        j += 1;
      }
    }
    while (i < m) {
      entries.push({ type: 'removed', text: midOld[i], oldLine: prefix + i + 1 });
      removed += 1;
      i += 1;
    }
    while (j < n) {
      entries.push({ type: 'added', text: midNew[j], newLine: prefix + j + 1 });
      added += 1;
      j += 1;
    }
  } else {
    for (let i = 0; i < midOld.length; i += 1) {
      entries.push({ type: 'removed', text: midOld[i], oldLine: prefix + i + 1 });
      removed += 1;
    }
    for (let j = 0; j < midNew.length; j += 1) {
      entries.push({ type: 'added', text: midNew[j], newLine: prefix + j + 1 });
      added += 1;
    }
  }

  for (let i = oldEnd + 1, j = newEnd + 1; i < oldLines.length; i += 1, j += 1) {
    entries.push({ type: 'unchanged', text: oldLines[i], oldLine: i + 1, newLine: j + 1 });
  }

  return { entries, added, removed };
}

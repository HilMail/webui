/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useEffect, useMemo, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, placeholder as placeholderExt } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { AlertTriangle, Check, CheckCircle2, Code2, GitCompareArrows, Lock, LockOpen, WrapText } from 'lucide-react';

import { CopyButton } from '@/components/common/CopyButton';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useCopyToClipboard } from '@/hooks/useCopyToClipboard';
import { checkSieveSyntax, computeLineDiff, SIEVE_SNIPPETS } from '@/lib/sieveDiagnostics';
import { sieveLanguage } from '@/lib/sieveLanguage';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';

export interface SieveEditorProps {
  value: string;
  // Saved server copy used to surface an inline unified diff before saving production policy edits.
  baselineValue?: string;
  onCommit?: (value: string) => void;
  disabled?: boolean;
  readOnly?: boolean;
  placeholder?: string;
  id?: string;
  'aria-invalid'?: boolean;
  'aria-describedby'?: string;
  'aria-labelledby'?: string;
  'aria-required'?: boolean;
}

/**
 * Base CodeMirror structural styling bound to the host theme's CSS custom
 * properties so light and dark modes blend natively into card form surfaces.
 */
const BASE_THEME = EditorView.theme({
  '&': {
    fontSize: '12.5px',
    fontFamily: 'var(--font-mono, ui-monospace, SFMono-Regular, Menlo, monospace)',
    backgroundColor: 'transparent',
  },
  '.cm-scroller': {
    minHeight: '16rem',
    maxHeight: '34rem',
    overflow: 'auto',
    lineHeight: '1.55',
  },
  '.cm-gutters': {
    backgroundColor: 'transparent',
    borderRight: '1px solid var(--border)',
    color: 'var(--muted-foreground)',
    userSelect: 'none',
  },
  '.cm-activeLineGutter': {
    backgroundColor: 'var(--muted)',
  },
  '.cm-content': {
    paddingBlock: '0.625rem',
  },
  '&.cm-focused': {
    outline: 'none',
  },
});

const LIGHT_HIGHLIGHT = syntaxHighlighting(defaultHighlightStyle, { fallback: true });

/**
 * CodeMirror 6 Sieve & MTA policy script editor with line numbers, folding,
 * syntax highlighting, `Cmd/Ctrl+F` search, word-wrap toggle, copy button,
 * and automatic light/dark theme synchronization.
 */
export function SieveEditor({
  value,
  baselineValue,
  onCommit,
  disabled = false,
  readOnly = false,
  placeholder,
  id,
  'aria-invalid': ariaInvalid,
  'aria-describedby': ariaDescribedBy,
  'aria-labelledby': ariaLabelledBy,
  'aria-required': ariaRequired,
}: SieveEditorProps) {
  const { t } = useTranslation();
  const theme = useUIStore((s) => s.theme);
  const [wordWrap, setWordWrap] = useState(true);
  const [dryRead, setDryRead] = useState(false);
  const [showDiff, setShowDiff] = useState(false);
  const { copy: copySnippet, isCopied: isSnippetCopied } = useCopyToClipboard();
  const hostRef = useRef<HTMLDivElement | null>(null);
  const viewRef = useRef<EditorView | null>(null);
  const isSyncingExternalRef = useRef(false);
  const onCommitRef = useRef(onCommit);

  useEffect(() => {
    onCommitRef.current = onCommit;
  }, [onCommit]);

  // Use dedicated compartments so theme, wrap, readOnly, and a11y attributes reconfigure without recreating editor state/history.
  const [compartments] = useState(() => ({
    theme: new Compartment(),
    readOnly: new Compartment(),
    wrap: new Compartment(),
    attrs: new Compartment(),
    placeholder: new Compartment(),
  }));

  const canToggleDryRead = !disabled && !readOnly;
  const isReadOnly = disabled || readOnly || dryRead;
  const lineCount = value === '' ? 1 : value.split('\n').length;
  const syntax = useMemo(() => checkSieveSyntax(value), [value]);
  const diff = useMemo(() => {
    if (baselineValue === undefined || baselineValue === value) return null;
    const computed = computeLineDiff(baselineValue, value);
    return computed.added > 0 || computed.removed > 0 ? computed : null;
  }, [baselineValue, value]);
  const hasDiff = diff !== null;
  const showingDiff = showDiff && hasDiff;

  useEffect(() => {
    const parent = hostRef.current;
    if (!parent) return;

    const a11yAttrs: Record<string, string> = { spellcheck: 'false' };
    if (id) a11yAttrs.id = id;
    if (ariaInvalid) a11yAttrs['aria-invalid'] = 'true';
    if (ariaDescribedBy) a11yAttrs['aria-describedby'] = ariaDescribedBy;
    if (ariaLabelledBy) a11yAttrs['aria-labelledby'] = ariaLabelledBy;
    if (ariaRequired) a11yAttrs['aria-required'] = 'true';

    const state = EditorState.create({
      doc: value,
      extensions: [
        basicSetup,
        sieveLanguage,
        BASE_THEME,
        compartments.theme.of(theme === 'dark' ? oneDark : LIGHT_HIGHLIGHT),
        compartments.readOnly.of([EditorState.readOnly.of(isReadOnly), EditorView.editable.of(!isReadOnly)]),
        compartments.wrap.of(wordWrap ? EditorView.lineWrapping : []),
        compartments.attrs.of(EditorView.contentAttributes.of(a11yAttrs)),
        compartments.placeholder.of(placeholder ? placeholderExt(placeholder) : []),
        EditorView.updateListener.of((update) => {
          if (update.docChanged && !isSyncingExternalRef.current) {
            onCommitRef.current?.(update.state.doc.toString());
          }
        }),
      ],
    });

    const view = new EditorView({ state, parent });
    viewRef.current = view;
    return () => {
      view.destroy();
      viewRef.current = null;
    };
    // Initial mount captures baseline value/config; subsequent updates sync via effects below to preserve undo history.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Synchronize external prop resets (e.g. Discard/variant switch) without clobbering user typing or echoing onCommit.
  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const current = view.state.doc.toString();
    if (current === value) return;
    isSyncingExternalRef.current = true;
    try {
      view.dispatch({
        changes: { from: 0, to: current.length, insert: value },
      });
    } finally {
      isSyncingExternalRef.current = false;
    }
  }, [value]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartments.theme.reconfigure(theme === 'dark' ? oneDark : LIGHT_HIGHLIGHT),
    });
  }, [compartments, theme]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartments.readOnly.reconfigure([
        EditorState.readOnly.of(isReadOnly),
        EditorView.editable.of(!isReadOnly),
      ]),
    });
  }, [compartments, isReadOnly]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    view.dispatch({
      effects: compartments.wrap.reconfigure(wordWrap ? EditorView.lineWrapping : []),
    });
  }, [compartments, wordWrap]);

  useEffect(() => {
    const view = viewRef.current;
    if (!view) return;
    const a11yAttrs: Record<string, string> = { spellcheck: 'false' };
    if (id) a11yAttrs.id = id;
    if (ariaInvalid) a11yAttrs['aria-invalid'] = 'true';
    if (ariaDescribedBy) a11yAttrs['aria-describedby'] = ariaDescribedBy;
    if (ariaLabelledBy) a11yAttrs['aria-labelledby'] = ariaLabelledBy;
    if (ariaRequired) a11yAttrs['aria-required'] = 'true';
    view.dispatch({
      effects: [
        compartments.attrs.reconfigure(EditorView.contentAttributes.of(a11yAttrs)),
        compartments.placeholder.reconfigure(placeholder ? placeholderExt(placeholder) : []),
      ],
    });
  }, [ariaDescribedBy, ariaInvalid, ariaLabelledBy, ariaRequired, compartments, id, placeholder]);

  return (
    <div className="field-surface overflow-hidden rounded-xl border border-border">
      <div className="flex flex-wrap items-center justify-between gap-2 border-b border-border bg-muted/70 px-3 py-1.5 text-[11px] font-semibold uppercase tracking-wider text-dim">
        <div className="flex items-center gap-2">
          <span className="font-mono text-foreground/80">{t('field.sieveBadge', 'SIEVE')}</span>
          <span className="font-normal normal-case tabular-nums text-muted-foreground">
            {t('field.lineCount', '{{count}} lines', { count: lineCount })}
          </span>
          {(disabled || readOnly) && (
            <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium normal-case text-muted-foreground">
              {t('field.readOnly', 'Read-only')}
            </span>
          )}
          {canToggleDryRead && dryRead && (
            <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium normal-case text-warning">
              {t('field.dryReadActive', 'Dry-read lock')}
            </span>
          )}
        </div>
        <div className="flex flex-wrap items-center gap-1">
          {hasDiff && (
            <button
              type="button"
              aria-pressed={showingDiff}
              onClick={() => setShowDiff((d) => !d)}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium normal-case tabular-nums transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                showingDiff
                  ? 'bg-highlight text-highlight-foreground'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              <GitCompareArrows className="h-3 w-3" aria-hidden="true" />
              {t('field.sieveDiff', 'Diff')} (+{diff.added}/-{diff.removed})
            </button>
          )}
          {canToggleDryRead && (
            <button
              type="button"
              aria-pressed={dryRead}
              onClick={() => setDryRead((v) => !v)}
              className={cn(
                'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                dryRead
                  ? 'bg-highlight text-highlight-foreground'
                  : 'text-muted-foreground hover:bg-card hover:text-foreground',
              )}
            >
              {dryRead ? <Lock className="h-3 w-3" aria-hidden="true" /> : <LockOpen className="h-3 w-3" aria-hidden="true" />}
              {t('field.dryRead', 'Dry-read')}
            </button>
          )}
          <Popover>
            <PopoverTrigger asChild>
              <button
                type="button"
                className="inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium normal-case text-muted-foreground transition-colors hover:bg-card hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
              >
                <Code2 className="h-3 w-3" aria-hidden="true" />
                {t('field.sieveSnippets', 'Snippets')}
              </button>
            </PopoverTrigger>
            <PopoverContent align="end" className="w-80 p-2">
              <p className="px-2 py-1 text-[11px] font-semibold uppercase tracking-wider text-dim">
                {t('field.sieveCopySnippet', 'Copy snippet to clipboard')}
              </p>
              <div className="mt-1 flex flex-col gap-1">
                {SIEVE_SNIPPETS.map((snippet) => {
                  const copied = isSnippetCopied(snippet.id);
                  return (
                    <button
                      key={snippet.id}
                      type="button"
                      onClick={() => void copySnippet(snippet.code, snippet.id)}
                      className="flex items-start justify-between gap-2 rounded-lg px-2 py-1.5 text-left transition-colors hover:bg-muted focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    >
                      <span className="min-w-0">
                        <span className="block text-xs font-medium text-foreground">{snippet.label}</span>
                        <span className="block truncate font-mono text-[11px] text-dim">{snippet.description}</span>
                      </span>
                      {copied && (
                        <span className="inline-flex shrink-0 items-center gap-1 text-[11px] font-medium text-emerald-600 dark:text-emerald-400">
                          <Check className="h-3 w-3" aria-hidden="true" />
                          {t('common.copied', 'Copied')}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>
            </PopoverContent>
          </Popover>
          <button
            type="button"
            aria-pressed={wordWrap}
            onClick={() => setWordWrap((w) => !w)}
            className={cn(
              'inline-flex items-center gap-1 rounded px-2 py-0.5 text-[11px] font-medium normal-case transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              wordWrap
                ? 'bg-highlight text-highlight-foreground'
                : 'text-muted-foreground hover:bg-card hover:text-foreground',
            )}
          >
            <WrapText className="h-3 w-3" aria-hidden="true" />
            {t('field.wordWrap', 'Wrap')}
          </button>
          <CopyButton value={value} label={t('field.sieveSourceCopy', 'Sieve script')} />
        </div>
      </div>
      {showingDiff && diff && (
        <div
          role="region"
          aria-label={t('field.sieveDiffRegion', 'Sieve policy diff')}
          className="max-h-[34rem] min-h-[16rem] overflow-auto bg-card font-mono text-[12.5px] leading-[1.55]"
        >
          {diff.entries.map((entry, idx) => (
            <div
              key={`${idx}-${entry.oldLine ?? ''}-${entry.newLine ?? ''}`}
              className={cn(
                'grid grid-cols-[2.75rem_2.75rem_1.25rem_1fr] items-baseline px-2',
                entry.type === 'added' && 'bg-emerald-500/10 text-emerald-800 dark:text-emerald-300',
                entry.type === 'removed' && 'bg-destructive-soft text-destructive',
                entry.type === 'unchanged' && 'text-muted-foreground',
              )}
            >
              <span className="select-none pr-2 text-right text-[11px] tabular-nums opacity-60">
                {entry.oldLine ?? ''}
              </span>
              <span className="select-none pr-2 text-right text-[11px] tabular-nums opacity-60">
                {entry.newLine ?? ''}
              </span>
              <span className="select-none font-semibold">
                {entry.type === 'added' ? '+' : entry.type === 'removed' ? '-' : ' '}
              </span>
              <span className={cn('min-w-0', wordWrap ? 'whitespace-pre-wrap break-all' : 'whitespace-pre')}>
                {entry.text || ' '}
              </span>
            </div>
          ))}
        </div>
      )}
      {/* Keep CodeMirror mounted while viewing diffs so undo history and scroll state are preserved. */}
      <div ref={hostRef} className={cn('bg-card text-foreground', showingDiff && 'hidden')} />
      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-border bg-muted/40 px-3 py-1.5 text-[11px]">
        <div
          role="status"
          className={cn(
            'flex items-center gap-1.5 font-medium',
            syntax.status === 'error' && 'text-destructive',
            syntax.status === 'ok' && 'text-emerald-700 dark:text-emerald-400',
            syntax.status === 'empty' && 'text-muted-foreground',
          )}
        >
          {syntax.status === 'error' ? (
            <>
              <AlertTriangle className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{syntax.issues[0].message}</span>
            </>
          ) : syntax.status === 'ok' ? (
            <>
              <CheckCircle2 className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              <span>{t('field.sieveSyntaxOk', 'Syntax OK')}</span>
            </>
          ) : (
            <span>{t('field.sieveSyntaxEmpty', 'Empty script')}</span>
          )}
        </div>
        {baselineValue !== undefined && (
          <span className="tabular-nums text-muted-foreground">
            {hasDiff
              ? t('field.sieveDiffSummary', 'Modified (+{{added}} / -{{removed}})', {
                  added: diff.added,
                  removed: diff.removed,
                })
              : t('field.sieveSavedMatch', 'Matches saved')}
          </span>
        )}
      </div>
    </div>
  );
}

/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { defaultHighlightStyle, syntaxHighlighting } from '@codemirror/language';
import { Compartment, EditorState } from '@codemirror/state';
import { oneDark } from '@codemirror/theme-one-dark';
import { EditorView, placeholder as placeholderExt } from '@codemirror/view';
import { basicSetup } from 'codemirror';
import { WrapText } from 'lucide-react';

import { CopyButton } from '@/components/common/CopyButton';
import { sieveLanguage } from '@/lib/sieveLanguage';
import { cn } from '@/lib/utils';
import { useUIStore } from '@/stores/uiStore';

export interface SieveEditorProps {
  value: string;
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

  const isReadOnly = disabled || readOnly;
  const lineCount = value === '' ? 1 : value.split('\n').length;

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
          {isReadOnly && (
            <span className="rounded bg-card px-1.5 py-0.5 text-[10px] font-medium normal-case text-muted-foreground">
              {t('field.readOnly', 'Read-only')}
            </span>
          )}
        </div>
        <div className="flex items-center gap-1">
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
      <div ref={hostRef} className="bg-card text-foreground" />
    </div>
  );
}

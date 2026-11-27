/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Braces } from 'lucide-react';

import { CopyButton } from '@/components/common/CopyButton';
import { Button } from '@/components/ui/button';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { cn } from '@/lib/utils';

interface RawJsonDialogProps {
  title: string;
  original: Record<string, unknown>;
  draft: Record<string, unknown>;
}

/**
 * Inspectable modal showing the raw JMAP payload fetched via `get` alongside
 * the live form draft so admins can debug sync mismatches or copy exact IDs.
 */
export function RawJsonDialog({ title, original, draft }: RawJsonDialogProps) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const [tab, setTab] = useState<'original' | 'draft'>('original');

  const activeData = tab === 'original' ? original : draft;
  const formatted = JSON.stringify(activeData, null, 2);

  return (
    <>
      <Button type="button" variant="outline" size="sm" className="shrink-0" onClick={() => setOpen(true)}>
        <Braces className="h-4 w-4" aria-hidden="true" />
        <span className="max-sm:sr-only">{t('form.rawJson', 'Raw JSON')}</span>
      </Button>
      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="flex max-h-[82dvh] max-w-3xl flex-col gap-3">
          <DialogHeader>
            <DialogTitle>{t('form.rawJsonTitle', 'Raw JMAP Payload')}</DialogTitle>
            <DialogDescription className="truncate">{title}</DialogDescription>
          </DialogHeader>
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="inline-flex rounded-lg bg-muted p-0.5" role="tablist">
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'original'}
                onClick={() => setTab('original')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  tab === 'original'
                    ? 'bg-card text-foreground shadow-xs'
                    : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('form.rawJsonServer', 'Server Payload')}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={tab === 'draft'}
                onClick={() => setTab('draft')}
                className={cn(
                  'rounded-md px-3 py-1 text-xs font-medium transition-colors',
                  tab === 'draft' ? 'bg-card text-foreground shadow-xs' : 'text-muted-foreground hover:text-foreground',
                )}
              >
                {t('form.rawJsonDraft', 'Current Draft')}
              </button>
            </div>
            <CopyButton value={formatted} label={t('form.rawJsonCopy', 'JSON')} showText />
          </div>
          <pre className="min-h-0 flex-1 overflow-auto rounded-xl border border-border bg-muted p-3.5 font-mono text-xs leading-relaxed text-foreground">
            {formatted}
          </pre>
        </DialogContent>
      </Dialog>
    </>
  );
}

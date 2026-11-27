/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Download, Loader2 } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { toast } from '@/hooks/use-toast';
import { buildCsv, downloadCsv } from '@/lib/csvExport';
import { csvCellText, resolveCsvIdLabels } from '@/lib/csvCellText';
import { errorMessage } from '@/lib/jmapErrors';
import type { Column, Field, Schema } from '@/types/schema';
import type { ListItem } from './listQuery';

export interface ExportCsvButtonProps {
  schema: Schema;
  objectName: string;
  fileBase: string;
  columns: Column[];
  fields: Record<string, Field>;
  // Export only the currently loaded rows so large deployments (20k+ accounts) never hit JMAP's 10k fetchAll cap.
  rows: ListItem[];
  disabled?: boolean;
}

/**
 * Downloads the currently loaded list rows as a spreadsheet-safe UTF-8 CSV
 * with resolved object IDs, formatted sizes/durations, and synthetic columns.
 */
export function ExportCsvButton({
  schema,
  objectName,
  fileBase,
  columns,
  fields,
  rows,
  disabled = false,
}: ExportCsvButtonProps) {
  const { t } = useTranslation();
  const [exporting, setExporting] = useState(false);

  const run = async () => {
    if (rows.length === 0 || columns.length === 0) return;
    setExporting(true);
    try {
      const ctx = {
        schema,
        objectName,
        fields,
        labels: {
          yes: t('list.csvYes', 'Yes'),
          no: t('list.csvNo', 'No'),
          unlimited: t('list.unlimitedQuota', '∞'),
        },
      };
      const idLabels = await resolveCsvIdLabels(rows, columns, ctx);
      const csv = buildCsv(
        columns.map((column) => column.label),
        rows.map((row) => columns.map((column) => csvCellText(column.name, row, ctx, idLabels))),
      );
      downloadCsv(`${fileBase}-${new Date().toISOString().slice(0, 10)}.csv`, csv);
      toast({
        title: t('list.exportSuccess', 'Exported {{count}} rows to CSV', { count: rows.length }),
        variant: 'success',
      });
    } catch (err) {
      toast({ title: errorMessage(err), variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  return (
    <Button
      type="button"
      variant="secondary"
      size="sm"
      onClick={() => void run()}
      disabled={disabled || exporting || columns.length === 0 || rows.length === 0}
    >
      {exporting ? <Loader2 className="animate-spin" aria-hidden /> : <Download aria-hidden />}
      {t('list.exportCsv', 'Export CSV')}
    </Button>
  );
}

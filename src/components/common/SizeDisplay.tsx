/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useState, type ReactNode } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { Info, Loader2, RefreshCw } from 'lucide-react';
import { useTranslation } from 'react-i18next';

import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { invalidateObjectType, useJmapSet } from '@/data/mutations';
import { useToast } from '@/hooks/use-toast';
import { usePermissionCheckers } from '@/hooks/usePermissions';
import { formatSize } from '@/lib/format';
import { errorMessage, friendlySetError } from '@/lib/jmapErrors';

interface SizeDisplayProps {
  bytes: number;
  // Optional JMAP account ID enabling a one-click AccountMaintenance quota recalculation task on negative counters.
  accountId?: string;
  className?: string;
}

/**
 * Formats a byte size. Negative values occur when Stalwart's disk-usage
 * counter drifts out of sync (e.g., after migration or reset), so we render
 * them in `text-destructive` with an info popover and optional 1-click recalculation.
 */
export function SizeDisplay({ bytes, accountId, className }: SizeDisplayProps): ReactNode {
  const { t } = useTranslation();
  const { toast } = useToast();
  const queryClient = useQueryClient();
  const { hasPermission } = usePermissionCheckers();
  const setTask = useJmapSet('x:Task');
  const [open, setOpen] = useState(false);

  const label = Number.isFinite(bytes) ? formatSize(bytes) : formatSize(0);

  if (!Number.isFinite(bytes) || bytes >= 0) {
    return <span className={className}>{label}</span>;
  }

  const canRecalculate = !!accountId && hasPermission('taskAccountMaintenance');

  const handleRecalculate = async () => {
    if (!accountId) return;
    try {
      const response = await setTask.mutateAsync({
        create: {
          recalc: {
            '@type': 'AccountMaintenance',
            accountId,
            maintenanceType: 'recalculateQuota',
          },
        },
      });
      const createdError = response.notCreated?.recalc;
      if (createdError) {
        toast({
          variant: 'destructive',
          title: t('list.recalculateQuotaFailed', 'Failed to schedule quota recalculation'),
          description: friendlySetError(createdError),
        });
        return;
      }
      toast({
        variant: 'success',
        title: t('list.recalculateQuotaScheduled', 'Quota recalculation scheduled'),
        description: t(
          'list.recalculateQuotaScheduledDesc',
          'Stalwart queued an AccountMaintenance task to recalculate usage for this account.',
        ),
      });
      setOpen(false);
      // Invalidate account queries so subsequent refreshes reflect the recalculated counter once the background task runs.
      void invalidateObjectType(queryClient, 'x:Account');
    } catch (err) {
      toast({
        variant: 'destructive',
        title: t('list.recalculateQuotaFailed', 'Failed to schedule quota recalculation'),
        description: errorMessage(err),
      });
    }
  };

  return (
    <span className={`inline-flex items-center gap-1.5 ${className ?? ''}`.trim()}>
      <span className="font-medium text-destructive">{label}</span>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger asChild>
          <button
            type="button"
            className="inline-flex shrink-0 text-destructive hover:text-destructive/80 focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
            aria-label={t('list.negativeQuotaInfoAria', 'Why is disk usage negative?')}
            // Prevent row-click navigation when inspecting or triggering recalculation inside a table cell.
            onClick={(e) => e.stopPropagation()}
          >
            <Info className="h-3.5 w-3.5" aria-hidden="true" />
          </button>
        </PopoverTrigger>
        <PopoverContent
          side="top"
          align="start"
          className="w-80 space-y-2.5 p-3 text-left text-xs"
          onClick={(e) => e.stopPropagation()}
        >
          <p className="leading-relaxed text-muted-foreground">
            {t(
              'list.negativeQuotaTooltip',
              'This disk-usage counter is out of sync (often after a migration or reset). Schedule a task: Perform account maintenance operations → Recalculate storage quota usage for the account. Or for all accounts: Perform store maintenance operations → Reset all user quotas.',
            )}
          </p>
          {canRecalculate && (
            <Button
              type="button"
              size="sm"
              variant="outline"
              disabled={setTask.isPending}
              onClick={() => void handleRecalculate()}
            >
              {setTask.isPending ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin" aria-hidden="true" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5" aria-hidden="true" />
              )}
              {t('list.recalculateQuota', 'Recalculate quota')}
            </Button>
          )}
        </PopoverContent>
      </Popover>
    </span>
  );
}

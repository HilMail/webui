/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { Loader2, RefreshCw, RotateCcw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { useJmapSet } from '@/data/mutations';
import { toast } from '@/hooks/use-toast';
import type { ContextualActionDef, ContextualActionType } from '@/lib/contextualActions';
import { errorMessage, friendlySetError } from '@/lib/jmapErrors';

const ACTION_CREATE_ID = 'action-0';

export interface ContextualActionBarProps {
  actions: readonly ContextualActionDef[];
  onSuccess?: () => void;
}

/**
 * Renders 1-click contextual `x:Action/set` shortcuts right in list headers
 * (e.g. cache invalidation on Accounts/Directories/Domains, reloads on Certs/Blocked IPs).
 */
export function ContextualActionBar({ actions, onSuccess }: ContextualActionBarProps) {
  const { t } = useTranslation();
  const actionMutation = useJmapSet('x:Action');
  const [runningType, setRunningType] = useState<ContextualActionType | null>(null);

  if (actions.length === 0) return null;

  const trigger = async (entry: ContextualActionDef) => {
    if (runningType !== null) return;
    setRunningType(entry.actionType);
    try {
      const result = await actionMutation.mutateAsync({
        create: { [ACTION_CREATE_ID]: { '@type': entry.actionType } },
      });
      const failure = result.notCreated?.[ACTION_CREATE_ID];
      if (failure) {
        toast({ title: friendlySetError(failure), variant: 'destructive' });
        return;
      }
      toast({ title: t(...entry.successKey), variant: 'success' });
      onSuccess?.();
    } catch (err) {
      toast({
        title: errorMessage(err, t('actions.actionFailed', 'Action failed.')),
        variant: 'destructive',
      });
    } finally {
      setRunningType(null);
    }
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      {actions.map((entry) => {
        const busy = runningType === entry.actionType;
        const Icon = entry.actionType.startsWith('Reload') ? RefreshCw : RotateCcw;
        return (
          <Button
            key={entry.actionType}
            type="button"
            variant="outline"
            size="sm"
            title={t(...entry.descriptionKey)}
            disabled={runningType !== null}
            onClick={() => void trigger(entry)}
          >
            {busy ? <Loader2 className="animate-spin" aria-hidden /> : <Icon aria-hidden />}
            {t(...entry.labelKey)}
          </Button>
        );
      })}
    </div>
  );
}

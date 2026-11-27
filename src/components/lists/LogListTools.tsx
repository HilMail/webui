/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useEffect, useEffectEvent, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { RefreshCw } from 'lucide-react';

import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import { cn } from '@/lib/utils';
import { LOG_TIME_RANGE_KEY, LOG_TIME_RANGES, type LogTimeRange } from './clientList';

const REFRESH_COOLDOWN_MS = 5000;
const AUTO_REFRESH_MS = 10_000;

interface LogListToolsProps {
  filters: Record<string, string>;
  isFirstPage: boolean;
  isFetching: boolean;
  onRefresh: () => void;
  onApplyFilters: (filters: Record<string, string>) => void;
}

const TIME_LABELS: Record<LogTimeRange, [string, string]> = {
  '15m': ['list.timeRange15m', '15m'],
  '1h': ['list.timeRange1h', '1h'],
  '24h': ['list.timeRange24h', '24h'],
};

/**
 * Toolbar controls for `x:Log`: 1-click relative time-window chips (evaluated
 * client-side because `x:Log/query` only filters by text), rate-limited Refresh,
 * and 10s auto-refresh on page 1 (paused while the tab is hidden).
 */
export function LogListTools({ filters, isFirstPage, isFetching, onRefresh, onApplyFilters }: LogListToolsProps) {
  const { t } = useTranslation();
  const [autoRefresh, setAutoRefresh] = useState(false);
  const [cooling, setCooling] = useState(false);

  const activeRange = filters[LOG_TIME_RANGE_KEY];

  useEffect(() => {
    if (!cooling) return;
    const timer = setTimeout(() => setCooling(false), REFRESH_COOLDOWN_MS);
    return () => clearTimeout(timer);
  }, [cooling]);

  const tick = useEffectEvent(() => {
    if (document.visibilityState !== 'hidden' && isFirstPage && !isFetching) onRefresh();
  });

  useEffect(() => {
    if (!autoRefresh) return;
    const timer = setInterval(tick, AUTO_REFRESH_MS);
    return () => clearInterval(timer);
  }, [autoRefresh]);

  const toggleRange = (range: LogTimeRange) => {
    const next = { ...filters };
    if (activeRange === range) delete next[LOG_TIME_RANGE_KEY];
    else next[LOG_TIME_RANGE_KEY] = range;
    onApplyFilters(next);
  };

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div className="flex items-center gap-1" role="group" aria-label={t('list.timeRangeGroup', 'Time range')}>
        {LOG_TIME_RANGES.map((range) => {
          const selected = activeRange === range;
          const [key, fallback] = TIME_LABELS[range];
          return (
            <button
              key={range}
              type="button"
              aria-pressed={selected}
              onClick={() => toggleRange(range)}
              className={cn(
                'inline-flex h-7 items-center rounded-full px-2.5 text-xs font-medium transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
                selected
                  ? 'bg-highlight text-highlight-foreground hover:bg-highlight-strong'
                  : 'bg-muted text-muted-foreground hover:bg-muted-strong hover:text-foreground',
              )}
            >
              {t(key, fallback)}
            </button>
          );
        })}
      </div>

      <Button
        type="button"
        variant="outline"
        size="sm"
        disabled={cooling || isFetching}
        title={cooling ? t('list.refreshCooldown', 'Please wait a few seconds before refreshing again') : undefined}
        onClick={() => {
          setCooling(true);
          onRefresh();
        }}
      >
        <RefreshCw className={cn('h-3.5 w-3.5', isFetching && 'animate-spin')} aria-hidden />
        {t('list.refresh', 'Refresh')}
      </Button>

      <div className="flex items-center gap-1.5 rounded-full bg-muted px-2.5 py-1">
        <Switch
          id="log-auto-refresh"
          checked={autoRefresh}
          onCheckedChange={setAutoRefresh}
          disabled={!isFirstPage && !autoRefresh}
        />
        <Label htmlFor="log-auto-refresh" className="cursor-pointer text-xs text-muted-foreground">
          {t('list.autoRefresh', 'Auto-refresh')}
        </Label>
      </div>
    </div>
  );
}

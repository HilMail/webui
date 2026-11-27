/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useState } from 'react';
import { useTranslation } from 'react-i18next';

import { SizeDisplay } from '@/components/common/SizeDisplay';
import { Badge } from '@/components/ui/badge';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { useDisplayName } from '@/data/objectOptions';
import { formatNumber, formatSize } from '@/lib/format';
import {
  COUNT_COLUMN_SOURCES,
  QUOTA_USAGE_COLUMN,
  computeQuotaUsage,
  getCountColumnValue,
} from '@/lib/syntheticColumns';
import type { Schema } from '@/types/schema';

interface ParsedAlias {
  key: string;
  name: string;
  domainId: string | null;
  enable: boolean;
}

/** Extracts `EmailAlias` entries from a row's `aliases` JMAP objectList map. */
function extractAliases(item: Record<string, unknown>): ParsedAlias[] {
  const raw = item.aliases;
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return [];
  return Object.entries(raw as Record<string, unknown>).flatMap(([key, entry]) => {
    if (!entry || typeof entry !== 'object' || Array.isArray(entry)) return [];
    const obj = entry as Record<string, unknown>;
    const name = typeof obj.name === 'string' ? obj.name : key;
    const domainId = typeof obj.domainId === 'string' && obj.domainId ? obj.domainId : null;
    const enable = obj.enable !== false;
    return [{ key, name, domainId, enable }];
  });
}

/** Resolves domain display names lazily on popover open so table renders never fan out extra JMAP `/get` requests. */
function AliasPopoverRow({ entry, schema }: { entry: ParsedAlias; schema: Schema }) {
  const { t } = useTranslation();
  const { label: domain } = useDisplayName('x:Domain', entry.domainId, schema);
  const address = entry.domainId ? `${entry.name}@${domain ?? entry.domainId}` : entry.name;

  return (
    <li className="flex items-center justify-between gap-2 rounded-md bg-muted/60 px-2.5 py-1.5 text-xs">
      <span className="truncate font-mono text-foreground">{address}</span>
      <Badge variant={entry.enable ? 'secondary' : 'outline'} className="shrink-0 text-[10px]">
        {entry.enable ? t('common.enabled', 'Enabled') : t('common.disabled', 'Disabled')}
      </Badge>
    </li>
  );
}

/** Shows the alias count and opens a compact inline popover listing the actual alias addresses. */
function AliasCountCell({ item, schema }: { item: Record<string, unknown>; schema: Schema }) {
  const { t } = useTranslation();
  const [open, setOpen] = useState(false);
  const aliases = extractAliases(item);
  const count = aliases.length;

  if (count === 0) {
    return <span className="tabular-nums text-muted-foreground">{formatNumber(0)}</span>;
  }

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center rounded-md bg-muted px-2 py-0.5 text-xs font-medium tabular-nums text-foreground transition-colors hover:bg-muted-strong focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          aria-label={t('list.aliasesPopoverTrigger', 'View {{count}} aliases', { count })}
          // Prevent navigating into the account form when clicking the badge just to inspect aliases.
          onClick={(e) => e.stopPropagation()}
        >
          {formatNumber(count)}
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-80 space-y-2 p-3" onClick={(e) => e.stopPropagation()}>
        <p className="text-xs font-semibold text-foreground">
          {t('list.aliasesPopoverTitle', 'Aliases ({{count}})', { count })}
        </p>
        <ul className="max-h-56 space-y-1.5 overflow-y-auto">
          {aliases.map((entry) => (
            <AliasPopoverRow key={entry.key} entry={entry} schema={schema} />
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

/** Renders disk usage against max quota, adding a threshold progress bar when a finite limit exists. */
function QuotaUsageCell({ item }: { item: Record<string, unknown> }) {
  const { t } = useTranslation();
  const { used, limit } = computeQuotaUsage(item);
  const accountId = typeof item.id === 'string' && item.id ? item.id : undefined;
  const limitLabel = limit ? formatSize(limit) : t('list.unlimitedQuota', '∞');

  const text =
    used >= 0 ? (
      `${formatSize(used)} / ${limitLabel}`
    ) : (
      <span className="inline-flex items-center gap-1.5">
        <SizeDisplay bytes={used} accountId={accountId} />
        <span className="text-muted-foreground">/</span>
        <span>{limitLabel}</span>
      </span>
    );

  // A progress bar is only meaningful against a finite limit with a non-negative usage counter.
  if (used < 0 || limit <= 0) return <>{text}</>;

  const percent = Math.min(100, (used / limit) * 100);
  const barColor = percent >= 90 ? 'bg-destructive' : percent >= 70 ? 'bg-warning' : 'bg-success';

  return (
    <div className="flex min-w-[8rem] flex-col gap-1">
      <span>{text}</span>
      <div
        className="h-1.5 w-full overflow-hidden rounded-full bg-muted"
        role="progressbar"
        aria-valuenow={Math.round(percent)}
        aria-valuemin={0}
        aria-valuemax={100}
        aria-label={t('list.quotaUsagePercent', 'Quota used')}
      >
        <div className={`h-full rounded-full ${barColor}`} style={{ width: `${percent}%` }} />
      </div>
    </div>
  );
}

interface SyntheticCellProps {
  column: string;
  item: Record<string, unknown>;
  schema: Schema;
}

/** Renders synthetic list columns derived from multiple or map-valued JMAP properties. */
export function SyntheticCell({ column, item, schema }: SyntheticCellProps) {
  if (column === QUOTA_USAGE_COLUMN) return <QuotaUsageCell item={item} />;
  if (column === 'aliasCount') return <AliasCountCell item={item} schema={schema} />;
  if (column in COUNT_COLUMN_SOURCES) {
    return <span className="tabular-nums">{formatNumber(getCountColumnValue(column, item))}</span>;
  }
  return null;
}

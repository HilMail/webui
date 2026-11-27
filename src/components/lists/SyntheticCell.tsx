/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { useTranslation } from 'react-i18next';

import { SizeDisplay } from '@/components/common/SizeDisplay';
import { formatNumber, formatSize } from '@/lib/format';
import {
  COUNT_COLUMN_SOURCES,
  QUOTA_USAGE_COLUMN,
  computeQuotaUsage,
  getCountColumnValue,
} from '@/lib/syntheticColumns';

/** Renders disk usage against max quota, adding a threshold progress bar when a finite limit exists. */
function QuotaUsageCell({ item }: { item: Record<string, unknown> }) {
  const { t } = useTranslation();
  const { used, limit } = computeQuotaUsage(item);
  const limitLabel = limit ? formatSize(limit) : t('list.unlimitedQuota', '∞');

  const text =
    used >= 0 ? (
      `${formatSize(used)} / ${limitLabel}`
    ) : (
      <span className="inline-flex items-center gap-1.5">
        <SizeDisplay bytes={used} />
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
}

/** Renders synthetic list columns derived from multiple or map-valued JMAP properties. */
export function SyntheticCell({ column, item }: SyntheticCellProps) {
  if (column === QUOTA_USAGE_COLUMN) return <QuotaUsageCell item={item} />;
  if (column in COUNT_COLUMN_SOURCES) {
    return <span className="tabular-nums">{formatNumber(getCountColumnValue(column, item))}</span>;
  }
  return null;
}

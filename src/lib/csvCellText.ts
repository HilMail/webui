/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { loadDisplayName } from '@/data/displayNames';
import { formatDateTime, formatDuration, formatNumber, formatSize } from '@/lib/format';
import { SECRET_MASK } from '@/lib/jmapUtils';
import { getDisplayProperty } from '@/lib/schemaResolver';
import {
  COUNT_COLUMN_SOURCES,
  QUOTA_USAGE_COLUMN,
  computeQuotaUsage,
  getCountColumnValue,
} from '@/lib/syntheticColumns';
import type { Field, NumberFormat, Schema } from '@/types/schema';

export interface CsvTextContext {
  schema: Schema;
  objectName: string;
  fields: Record<string, Field>;
  labels: { yes: string; no: string; unlimited: string };
}

type Item = Record<string, unknown>;

// Some Stalwart schemas declare byte fields (e.g. queued-message `size`) as unsignedInteger; promote them cleanly.
const BYTE_SIZE_PROPERTY_KEYS = new Set(['size', 'maxsize', 'useddiskquota', 'maxdiskquota']);

function effectiveNumberFormat(propertyName: string, format: NumberFormat | string | undefined): NumberFormat | string | undefined {
  if (format === 'size' || format === 'duration' || format === 'float') return format;
  const key = propertyName.toLowerCase().replace(/[^a-z0-9]/g, '');
  if (BYTE_SIZE_PROPERTY_KEYS.has(key) && (format === 'integer' || format === 'unsignedInteger' || !format)) {
    return 'size';
  }
  return format;
}

function enumLabel(schema: Schema, enumName: string, value: string): string {
  return schema.enums[enumName]?.find((variant) => variant.name === value)?.label ?? value;
}

function variantLabel(schema: Schema, objectName: string, type: string): string {
  const entry = schema.schemas[objectName];
  if (entry?.type === 'multiple') return entry.variants.find((variant) => variant.name === type)?.label ?? type;
  return type;
}

/**
 * Formats one table cell as plain CSV text matching what the table displays.
 * `idLabels` contains pre-resolved `<objectName>\0<id>` display names from `resolveCsvIdLabels`.
 */
export function csvCellText(
  column: string,
  item: Item,
  ctx: CsvTextContext,
  idLabels: ReadonlyMap<string, string>,
): string {
  const { schema, objectName, fields } = ctx;

  if (column === QUOTA_USAGE_COLUMN) {
    const { used, limit } = computeQuotaUsage(item);
    return `${formatSize(used)} / ${limit ? formatSize(limit) : ctx.labels.unlimited}`;
  }
  if (column in COUNT_COLUMN_SOURCES) return String(getCountColumnValue(column, item));
  if (column === 'roles' && objectName === 'x:Account') {
    const type = (item.roles as Record<string, unknown> | undefined)?.['@type'];
    return typeof type === 'string' ? variantLabel(schema, 'x:UserRoles', type) : '';
  }

  const value = item[column];
  if (value == null) return '';
  if (column === '@type' && typeof value === 'string') return variantLabel(schema, objectName, value);

  const field = fields[column];
  if (!field) return typeof value === 'object' ? '' : String(value);
  const type = field.type;

  switch (type.type) {
    case 'string':
      if (type.format === 'secret' || type.format === 'secretText') return SECRET_MASK;
      return typeof value === 'object' ? JSON.stringify(value) : String(value);
    case 'boolean':
      return value ? ctx.labels.yes : ctx.labels.no;
    case 'number': {
      if (typeof value !== 'number') return String(value);
      const format = effectiveNumberFormat(column, type.format);
      if (format === 'size') return formatSize(value);
      if (format === 'duration') return formatDuration(value);
      return formatNumber(value);
    }
    case 'utcDateTime':
      return typeof value === 'string' || typeof value === 'number' ? formatDateTime(value) : String(value);
    case 'enum':
      return enumLabel(schema, type.enumName, String(value));
    case 'objectId':
      return idLabels.get(`${type.objectName}\u0000${String(value)}`) ?? String(value);
    case 'set': {
      if (!value || typeof value !== 'object') return '';
      const keys = Object.keys(value as Record<string, unknown>);
      if (type.class.type === 'enum') {
        const enumName = type.class.enumName;
        return keys.map((key) => enumLabel(schema, enumName, key)).join(', ');
      }
      if (type.class.type === 'objectId') {
        const refObjectName = type.class.objectName;
        return keys.map((key) => idLabels.get(`${refObjectName}\u0000${key}`) ?? key).join(', ');
      }
      return keys.join(', ');
    }
    case 'object': {
      const objectType = (value as Record<string, unknown>)['@type'];
      return typeof objectType === 'string' ? variantLabel(schema, type.objectName, objectType) : '';
    }
    default:
      return typeof value === 'object' ? '' : String(value);
  }
}

/** Batch-resolves display names for all objectId and set<objectId> references in the exported rows. */
export async function resolveCsvIdLabels(
  rows: Item[],
  columns: ReadonlyArray<{ name: string }>,
  ctx: Pick<CsvTextContext, 'schema' | 'fields'>,
): Promise<Map<string, string>> {
  const wanted = new Map<string, { objectName: string; id: string }>();
  for (const { name } of columns) {
    const type = ctx.fields[name]?.type;
    if (!type) continue;

    if (type.type === 'objectId') {
      for (const row of rows) {
        const id = row[name];
        if (typeof id === 'string' && id) {
          wanted.set(`${type.objectName}\u0000${id}`, { objectName: type.objectName, id });
        }
      }
    } else if (type.type === 'set' && type.class.type === 'objectId') {
      const refObjectName = type.class.objectName;
      for (const row of rows) {
        const raw = row[name];
        if (!raw || typeof raw !== 'object') continue;
        for (const id of Object.keys(raw as Record<string, unknown>)) {
          if (id) wanted.set(`${refObjectName}\u0000${id}`, { objectName: refObjectName, id });
        }
      }
    }
  }

  const labels = new Map<string, string>();
  await Promise.all(
    [...wanted].map(async ([key, { objectName, id }]) => {
      try {
        const label = await loadDisplayName(objectName, getDisplayProperty(ctx.schema, objectName), id);
        if (label) labels.set(key, label);
      } catch {
        // Keep raw ID as fallback when display name lookup fails.
      }
    }),
  );
  return labels;
}

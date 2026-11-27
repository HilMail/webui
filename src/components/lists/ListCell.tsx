/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { FieldValue, VariantValue } from '@/components/values/FieldValue';
import { EmptyValue } from '@/components/values/ScalarValues';
import { hasSyntheticCell } from '@/lib/syntheticColumns';
import type { Field, Schema } from '@/types/schema';
import { SyntheticCell } from './SyntheticCell';
import { scalarText } from './listQuery';

interface ListCellProps {
  schema: Schema;
  objectName: string;
  column: string;
  field: Field | undefined;
  value: unknown;
  item: Record<string, unknown>;
}

export function ListCell({ schema, objectName, column, field, value, item }: ListCellProps) {
  // Synthetic columns read multiple properties from the row rather than a single field value.
  if (hasSyntheticCell(column)) {
    return <SyntheticCell column={column} item={item} />;
  }
  if (field) return <FieldValue schema={schema} type={field.type} value={value} variant="compact" />;
  if (column === '@type' && typeof value === 'string' && value) {
    return <VariantValue schema={schema} objectName={objectName} value={value} />;
  }
  const text = scalarText(value);
  return text ? <>{text}</> : <EmptyValue variant="compact" />;
}

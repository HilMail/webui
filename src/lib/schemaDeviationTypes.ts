/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import type { Column } from '@/types/schema';

/**
 * Type augmentations for client-patched list columns.
 *
 * `src/types/schema.ts` mirrors the server's schema contract directly, so we
 * attach UI-only flags like `clientSortable` as an intersection type here
 * instead of mutating the core schema types.
 */
export type ClientSortableColumn = Column & { clientSortable?: boolean };

/** Returns true when a column is opted into browser-side sorting. */
export function isClientSortableColumn(column: Column): boolean {
  return (column as ClientSortableColumn).clientSortable === true;
}

/** Tags a column as client-sortable because the JMAP server cannot sort synthetic fields. */
export function clientSortable(column: Column): ClientSortableColumn {
  return { ...column, clientSortable: true };
}

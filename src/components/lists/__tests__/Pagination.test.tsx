/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { Pagination } from '@/components/lists/Pagination';
import { LIST_PAGE_SIZE, PAGE_SIZE_OPTIONS, sanitizePageSize } from '@/components/lists/listQuery';
import { useUIStore } from '@/stores/uiStore';

describe('Pagination and default page size', () => {
  it('defaults listPageSize to 100 and validates supported increment/decrement options', () => {
    expect(LIST_PAGE_SIZE).toBe(100);
    expect(PAGE_SIZE_OPTIONS).toEqual([25, 50, 100, 200, 500]);
    expect(sanitizePageSize(25)).toBe(25);
    expect(sanitizePageSize(500)).toBe(500);
    expect(sanitizePageSize(999)).toBe(100);
    expect(useUIStore.getState().listPageSize).toBe(100);
  });

  it('allows decreasing or increasing rows per page from the pagination control', () => {
    const onPageSize = vi.fn();

    render(
      <Pagination
        range={{ from: 1, to: 100, hasPrev: false, hasNext: true }}
        total={19885}
        count={100}
        pluralName="users"
        disabled={false}
        pageSize={100}
        onPageSize={onPageSize}
        onPrev={vi.fn()}
        onNext={vi.fn()}
      />,
    );

    expect(screen.getByText('Showing 1-100 of 19885 users')).toBeInTheDocument();

    const trigger = screen.getByRole('combobox', { name: 'Rows per page' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    fireEvent.click(screen.getByRole('option', { name: '200' }));
    expect(onPageSize).toHaveBeenCalledWith(200);

    fireEvent.keyDown(trigger, { key: 'Enter' });
    fireEvent.click(screen.getByRole('option', { name: '25' }));
    expect(onPageSize).toHaveBeenCalledWith(25);
  });
});

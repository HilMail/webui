/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';

import { LogListTools } from '@/components/lists/LogListTools';
import { LOG_TIME_RANGE_KEY } from '@/components/lists/clientList';

describe('LogListTools', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('toggles relative timeRange chips in filters', () => {
    const onApplyFilters = vi.fn();
    const { rerender } = render(
      <LogListTools
        filters={{ text: 'smtp' }}
        isFirstPage
        isFetching={false}
        onRefresh={vi.fn()}
        onApplyFilters={onApplyFilters}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    expect(onApplyFilters).toHaveBeenCalledWith({ text: 'smtp', [LOG_TIME_RANGE_KEY]: '1h' });

    // Clicking the already active time range chip clears it back to unbounded.
    rerender(
      <LogListTools
        filters={{ text: 'smtp', [LOG_TIME_RANGE_KEY]: '1h' }}
        isFirstPage
        isFetching={false}
        onRefresh={vi.fn()}
        onApplyFilters={onApplyFilters}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: '1h' }));
    expect(onApplyFilters).toHaveBeenLastCalledWith({ text: 'smtp' });
  });

  it('cooldown-guards manual Refresh and triggers 10s auto-refresh on page 1', () => {
    vi.useFakeTimers();
    const onRefresh = vi.fn();

    render(<LogListTools filters={{}} isFirstPage isFetching={false} onRefresh={onRefresh} onApplyFilters={vi.fn()} />);

    const refreshBtn = screen.getByRole('button', { name: 'Refresh' });
    fireEvent.click(refreshBtn);
    expect(onRefresh).toHaveBeenCalledTimes(1);
    expect(refreshBtn).toBeDisabled();

    act(() => {
      vi.advanceTimersByTime(5000);
    });
    expect(refreshBtn).not.toBeDisabled();

    fireEvent.click(screen.getByRole('switch', { name: 'Auto-refresh' }));
    act(() => {
      vi.advanceTimersByTime(10_000);
    });
    expect(onRefresh).toHaveBeenCalledTimes(2);
  });
});

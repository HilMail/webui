/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';

import { SizeDisplay } from '@/components/common/SizeDisplay';

const mockMutateAsync = vi.fn();
const mockInvalidateObjectType = vi.fn();
const mockToast = vi.fn();
let grantedPermissions = new Set<string>(['taskAccountMaintenance']);

vi.mock('@/data/mutations', () => ({
  useJmapSet: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
  invalidateObjectType: (...args: unknown[]) => mockInvalidateObjectType(...args),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissionCheckers: () => ({
    hasPermission: (perm: string) => grantedPermissions.has(perm),
    hasObjectPermission: () => true,
    canGet: () => true,
  }),
}));

function renderWithQuery(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('SizeDisplay', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    grantedPermissions = new Set(['taskAccountMaintenance']);
  });

  it('renders plain size text without an info trigger for non-negative byte counts', () => {
    renderWithQuery(<SizeDisplay bytes={1024} accountId="acc-1" />);
    expect(screen.queryByRole('button', { name: /negative/i })).not.toBeInTheDocument();
  });

  it('schedules AccountMaintenance recalculateQuota on click and invalidates account lists', async () => {
    mockMutateAsync.mockResolvedValueOnce({ created: { recalc: { id: 'task-1' } } });
    const rowClick = vi.fn();

    renderWithQuery(
      <div onClick={rowClick}>
        <SizeDisplay bytes={-2048} accountId="acc-42" />
      </div>,
    );

    const infoButton = screen.getByRole('button', { name: 'Why is disk usage negative?' });
    fireEvent.click(infoButton);
    // Stop row-click navigation when inspecting negative quota counters inside a table row.
    expect(rowClick).not.toHaveBeenCalled();

    const recalcButton = screen.getByRole('button', { name: 'Recalculate quota' });
    fireEvent.click(recalcButton);

    await waitFor(() => {
      expect(mockMutateAsync).toHaveBeenCalledWith({
        create: {
          recalc: {
            '@type': 'AccountMaintenance',
            accountId: 'acc-42',
            maintenanceType: 'recalculateQuota',
          },
        },
      });
    });

    expect(mockToast).toHaveBeenCalledWith(
      expect.objectContaining({ variant: 'success', title: 'Quota recalculation scheduled' }),
    );
    expect(mockInvalidateObjectType).toHaveBeenCalledWith(expect.anything(), 'x:Account');
  });

  it('hides the recalculate button without taskAccountMaintenance permission and surfaces JMAP errors', async () => {
    grantedPermissions = new Set();
    renderWithQuery(<SizeDisplay bytes={-512} accountId="acc-42" />);

    fireEvent.click(screen.getByRole('button', { name: 'Why is disk usage negative?' }));
    expect(screen.queryByRole('button', { name: 'Recalculate quota' })).not.toBeInTheDocument();

    grantedPermissions = new Set(['taskAccountMaintenance']);
    mockMutateAsync.mockResolvedValueOnce({ notCreated: { recalc: { type: 'forbidden' } } });
    renderWithQuery(<SizeDisplay bytes={-512} accountId="acc-99" />);
    fireEvent.click(screen.getAllByRole('button', { name: 'Why is disk usage negative?' })[1]);
    fireEvent.click(screen.getByRole('button', { name: 'Recalculate quota' }));

    await waitFor(() => {
      expect(mockToast).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', title: 'Failed to schedule quota recalculation' }),
      );
    });
  });
});

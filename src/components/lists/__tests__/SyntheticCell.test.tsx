/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import type { ReactNode } from 'react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';

import { SyntheticCell } from '@/components/lists/SyntheticCell';
import type { Schema } from '@/types/schema';

vi.mock('@/data/objectOptions', () => ({
  useDisplayName: (_objectName: string, id: string | null) => ({
    label: id === 'dom-1' ? 'hilmail.co' : null,
    loading: false,
    error: null,
  }),
}));

vi.mock('@/hooks/usePermissions', () => ({
  usePermissionCheckers: () => ({
    hasPermission: () => false,
    hasObjectPermission: () => true,
    canGet: () => true,
  }),
}));

const MINIMAL_SCHEMA: Schema = {
  objects: {},
  schemas: {},
  fields: {},
  forms: {},
  lists: {},
  enums: {},
  dashboards: [],
  layouts: [],
};

function renderCell(node: ReactNode) {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(<QueryClientProvider client={client}>{node}</QueryClientProvider>);
}

describe('SyntheticCell', () => {
  it('renders unlimited quota with infinity symbol and no progress bar', () => {
    renderCell(
      <SyntheticCell
        column="quotaUsage"
        item={{ id: 'u1', usedDiskQuota: 1024, quotas: { maxDiskQuota: 0 } }}
        schema={MINIMAL_SCHEMA}
      />,
    );

    expect(screen.getByText(/∞/)).toBeInTheDocument();
    expect(screen.queryByRole('progressbar')).not.toBeInTheDocument();
  });

  it('renders finite quota progress bars colored by usage threshold', () => {
    renderCell(
      <SyntheticCell
        column="quotaUsage"
        item={{ id: 'u2', usedDiskQuota: 950, quotas: { maxDiskQuota: 1000 } }}
        schema={MINIMAL_SCHEMA}
      />,
    );

    const bar = screen.getByRole('progressbar', { name: 'Quota used' });
    expect(bar).toHaveAttribute('aria-valuenow', '95');
    expect(bar.firstElementChild?.className).toContain('bg-destructive');
  });

  it('renders plain zero for empty aliases and opens an inline domain-resolved popover for non-zero aliases', () => {
    const { rerender } = renderCell(
      <SyntheticCell column="aliasCount" item={{ id: 'u0', aliases: {} }} schema={MINIMAL_SCHEMA} />,
    );
    expect(screen.getByText('0')).toBeInTheDocument();
    expect(screen.queryByRole('button')).not.toBeInTheDocument();

    const rowClick = vi.fn();
    rerender(
      <QueryClientProvider client={new QueryClient()}>
        <div onClick={rowClick}>
          <SyntheticCell
            column="aliasCount"
            schema={MINIMAL_SCHEMA}
            item={{
              id: 'u3',
              aliases: {
                a1: { name: 'team', domainId: 'dom-1', enable: true },
                a2: { name: 'old', domainId: 'dom-1', enable: false },
              },
            }}
          />
        </div>
      </QueryClientProvider>,
    );

    fireEvent.click(screen.getByRole('button', { name: 'View 2 aliases' }));
    expect(rowClick).not.toHaveBeenCalled();

    expect(screen.getByText('Aliases (2)')).toBeInTheDocument();
    expect(screen.getByText('team@hilmail.co')).toBeInTheDocument();
    expect(screen.getByText('old@hilmail.co')).toBeInTheDocument();
    expect(screen.getByText('Enabled')).toBeInTheDocument();
    expect(screen.getByText('Disabled')).toBeInTheDocument();
  });
});

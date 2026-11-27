/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { fireEvent, render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';

import { RawJsonDialog } from '@/components/forms/RawJsonDialog';

describe('RawJsonDialog', () => {
  it('opens and switches between Server Payload and Current Draft JSON views', () => {
    render(
      <RawJsonDialog
        title="Edit User: alice"
        original={{ id: 'u-1', name: 'alice', quotas: { maxDiskQuota: 500 } }}
        draft={{ id: 'u-1', name: 'alice', quotas: { maxDiskQuota: 1000 } }}
      />,
    );

    fireEvent.click(screen.getByRole('button', { name: 'Raw JSON' }));
    expect(screen.getByText('Raw JMAP Payload')).toBeInTheDocument();
    expect(screen.getByText(/"maxDiskQuota": 500/)).toBeInTheDocument();

    fireEvent.click(screen.getByRole('tab', { name: 'Current Draft' }));
    expect(screen.getByText(/"maxDiskQuota": 1000/)).toBeInTheDocument();
    expect(screen.getByRole('button', { name: /JSON payload/i })).toBeInTheDocument();
  });
});

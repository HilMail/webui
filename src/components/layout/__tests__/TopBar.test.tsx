/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { fireEvent, render, screen } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { beforeEach, describe, expect, it } from 'vitest';

import { TopBar } from '@/components/layout/TopBar';
import { TooltipProvider } from '@/components/ui/tooltip';
import { useAccountStore } from '@/stores/accountStore';
import { useAuthStore } from '@/stores/authStore';
import { useSchemaStore } from '@/stores/schemaStore';

describe('TopBar user menu', () => {
  beforeEach(() => {
    useSchemaStore.getState().setSchema({
      objects: {
        'x:Account': { type: 'object', description: 'Account', permissionPrefix: 'account' },
      },
      schemas: {},
      fields: {},
      forms: {},
      lists: {},
      enums: {},
      dashboards: [],
      layouts: [
        {
          name: 'Management',
          icon: 'monitor',
          items: [{ link: { name: 'Accounts', icon: 'users', viewName: 'x:Account' } }],
        },
      ],
    });
    useAccountStore.getState().setAccountInfo(['accountGet'], 'community', 'en-US');
    useAuthStore.setState({
      accounts: {
        a1: {
          name: 'nikhil-admin@automation.hilmail.co',
          isPersonal: false,
          hasManagement: true,
        },
      },
      activeAccountId: 'a1',
    });
  });

  it('allows long account email addresses to fit cleanly without clipping inside a rigid narrow menu', () => {
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <TooltipProvider>
            <TopBar />
          </TooltipProvider>
        </MemoryRouter>
      </QueryClientProvider>,
    );

    const trigger = screen.getByRole('button', { name: 'User menu' });
    fireEvent.keyDown(trigger, { key: 'Enter' });

    const menu = screen.getByRole('menu');
    // Drop rigid fixed w-56 so standard-length domain emails don't overflow/clip horizontally.
    const classes = menu.className.split(/\s+/);
    expect(classes).not.toContain('w-56');
    expect(classes).toContain('min-w-56');

    const accountItem = screen.getByRole('menuitemradio', { name: 'nikhil-admin@automation.hilmail.co' });
    expect(accountItem).toHaveAttribute('title', 'nikhil-admin@automation.hilmail.co');
    const accountText = screen.getByText('nikhil-admin@automation.hilmail.co');
    expect(accountText.className).toContain('min-w-0');
    expect(accountText.className).toContain('wrap-anywhere');
  });
});

/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { findPreferredDefaultLinkInLayout } from '@/lib/layout';
import type { Layout, Schema } from '@/types/schema';

const LAYOUT: Layout = {
  name: 'Management',
  icon: 'monitor',
  items: [
    { link: { name: 'Dashboard', icon: 'layout-dashboard', viewName: 'CustomComponent/Dashboard' } },
    { link: { name: 'Overview', icon: 'panels-top-left', viewName: 'CustomComponent/Overview' } },
    { link: { name: 'Users', icon: 'users', viewName: 'x:Account/User' } },
  ],
};

const SCHEMA: Schema = {
  objects: {
    'x:Account': { type: 'object', description: 'Account', permissionPrefix: 'account' },
    'x:Account/User': { type: 'view', objectName: 'x:Account' },
    'x:Metric': { type: 'object', description: 'Metric', permissionPrefix: 'metric', enterprise: true },
  },
  schemas: {},
  fields: {},
  forms: {},
  lists: {},
  enums: {},
  dashboards: [{ id: 'overview', name: 'Overview', cards: [], charts: [] } as never],
  layouts: [LAYOUT],
};

describe('findPreferredDefaultLinkInLayout', () => {
  it('defaults to Overview on Community edition when Enterprise Dashboard is inaccessible', () => {
    const link = findPreferredDefaultLinkInLayout(
      SCHEMA,
      LAYOUT,
      'community',
      () => true,
      () => true,
    );
    expect(link).toBe('CustomComponent/Overview');
  });

  it('defaults to Dashboard on Enterprise edition when permitted', () => {
    const link = findPreferredDefaultLinkInLayout(
      SCHEMA,
      LAYOUT,
      'enterprise',
      () => true,
      () => true,
    );
    expect(link).toBe('CustomComponent/Dashboard');
  });
});

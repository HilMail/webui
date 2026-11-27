/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it } from 'vitest';

import { buildQueuedMessageJumps, queuedMessageAddresses } from '@/lib/queueOpsLinks';
import type { Schema } from '@/types/schema';

function makeQueueSchema(): Schema {
  return {
    objects: {
      'x:Log': { type: 'object', description: 'Log', permissionPrefix: 'log' },
    },
    schemas: {},
    fields: {},
    forms: {},
    lists: {},
    enums: {},
    dashboards: [],
    layouts: [
      {
        name: 'troubleshoot',
        icon: 'activity',
        items: [
          { link: { name: 'Logs', icon: 'file-text', viewName: 'x:Log' } },
          { link: { name: 'Delivery Trace', icon: 'activity', viewName: 'CustomComponent/LiveDelivery' } },
        ],
      },
    ],
  };
}

const viewToSection = {
  'x:Log': 'troubleshoot',
  'CustomComponent/LiveDelivery': 'troubleshoot',
};

describe('queueOpsLinks', () => {
  it('extracts valid sender and non-empty recipients from queued message rows', () => {
    expect(
      queuedMessageAddresses({
        returnPath: ' sender@hilmail.co ',
        recipients: { 'a@example.com': {}, ' ': {}, 'b@example.com': {} },
      }),
    ).toEqual({
      sender: 'sender@hilmail.co',
      recipients: ['a@example.com', 'b@example.com'],
    });

    // Empty return path (bounces) must not be treated as a searchable email address.
    expect(queuedMessageAddresses({ returnPath: '<>', recipients: {} })).toEqual({
      sender: null,
      recipients: [],
    });
  });

  it('builds permission-gated Delivery Trace and Log Entries links capped to avoid menu overflow', () => {
    const schema = makeQueueSchema();
    const row = {
      returnPath: 'sender@hilmail.co',
      recipients: {
        'r1@example.com': {},
        'r2@example.com': {},
        'r3@example.com': {},
        'r4@example.com': {},
      },
    };
    const jumps = buildQueuedMessageJumps(
      row,
      schema,
      viewToSection,
      'community',
      {
        canGet: (prefix) => prefix === 'log',
        hasPermission: () => true,
      },
      {
        traceTarget: (addr) => `Trace ${addr}`,
        logsFor: (addr) => `Logs ${addr}`,
      },
    );

    expect(jumps.map((j) => j.href)).toEqual([
      '/troubleshoot/CustomComponent/LiveDelivery?target=r1%40example.com',
      '/troubleshoot/CustomComponent/LiveDelivery?target=r2%40example.com',
      '/troubleshoot/CustomComponent/LiveDelivery?target=r3%40example.com',
      '/troubleshoot/x:Log?f.text=sender%40hilmail.co',
      '/troubleshoot/x:Log?f.text=r1%40example.com',
      '/troubleshoot/x:Log?f.text=r2%40example.com',
    ]);
  });

  it('omits links when the user lacks log Get permission or tracing permissions', () => {
    const schema = makeQueueSchema();
    const row = { returnPath: 'sender@hilmail.co', recipients: { 'r1@example.com': {} } };

    const jumps = buildQueuedMessageJumps(
      row,
      schema,
      viewToSection,
      'community',
      {
        canGet: () => false,
        hasPermission: () => false,
      },
      {
        traceTarget: (addr) => `Trace ${addr}`,
        logsFor: (addr) => `Logs ${addr}`,
      },
    );

    expect(jumps).toEqual([]);
  });
});

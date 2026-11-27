/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { describe, expect, it, vi } from 'vitest';

import { csvCellText, resolveCsvIdLabels, type CsvTextContext } from '@/lib/csvCellText';
import { SECRET_MASK } from '@/lib/jmapUtils';
import type { Field, Schema } from '@/types/schema';

vi.mock('@/data/displayNames', () => ({
  loadDisplayName: vi.fn(async (objectName: string, _prop: string, id: string) => {
    if (objectName === 'x:Domain' && id === 'd1') return 'hilmail.co';
    if (objectName === 'x:Domain' && id === 'd2') throw new Error('network error');
    return null;
  }),
}));

const schema = {
  objects: {
    'x:Domain': { type: 'object', description: 'Domain', permissionPrefix: 'domain' },
  },
  schemas: {
    'x:UserRoles': { type: 'multiple', variants: [{ name: 'User', label: 'User role' }] },
  },
  fields: {},
  forms: {},
  lists: {
    'x:Domain': { title: 'Domains', subtitle: '', singularName: 'Domain', pluralName: 'Domains', columns: [{ name: 'name', label: 'Domain' }], labelProperty: 'name' },
  },
  enums: { Level: [{ name: 'error', label: 'Error' }] },
  dashboards: [],
  layouts: [],
} as unknown as Schema;

const fields: Record<string, Field> = {
  enabled: { type: { type: 'boolean' } } as Field,
  level: { type: { type: 'enum', enumName: 'Level' } } as Field,
  size: { type: { type: 'number', format: 'unsignedInteger' } } as Field,
  elapsed: { type: { type: 'number', format: 'duration' } } as Field,
  createdAt: { type: { type: 'utcDateTime' } } as Field,
  domainId: { type: { type: 'objectId', objectName: 'x:Domain' } } as Field,
  domainIds: { type: { type: 'set', class: { type: 'objectId', objectName: 'x:Domain' } } } as Field,
  tags: { type: { type: 'set', class: { type: 'string' } } } as unknown as Field,
  password: { type: { type: 'string', format: 'secret' } } as Field,
};

const ctx: CsvTextContext = {
  schema,
  objectName: 'x:Account',
  fields,
  labels: { yes: 'Yes', no: 'No', unlimited: '∞' },
};

describe('csvCellText', () => {
  it('formats synthetic quota, alias counts, and account roles like the list table', () => {
    const idLabels = new Map<string, string>();
    expect(csvCellText('quotaUsage', { usedDiskQuota: 1024, quotas: { maxDiskQuota: 2048 } }, ctx, idLabels)).toBe(
      '1 KB / 2 KB',
    );
    expect(csvCellText('quotaUsage', { usedDiskQuota: 0 }, ctx, idLabels)).toBe('0 B / ∞');
    expect(csvCellText('aliasCount', { aliases: { a: true, b: true } }, ctx, idLabels)).toBe('2');
    expect(csvCellText('roles', { roles: { '@type': 'User' } }, ctx, idLabels)).toBe('User role');
  });

  it('formats schema-driven booleans, sizes, durations, enums, dates, secrets, and sets', () => {
    const idLabels = new Map<string, string>([['x:Domain\u0000d1', 'hilmail.co']]);
    expect(csvCellText('enabled', { enabled: true }, ctx, idLabels)).toBe('Yes');
    expect(csvCellText('enabled', { enabled: false }, ctx, idLabels)).toBe('No');
    expect(csvCellText('level', { level: 'error' }, ctx, idLabels)).toBe('Error');
    expect(csvCellText('size', { size: 2048 }, ctx, idLabels)).toBe('2 KB');
    expect(csvCellText('elapsed', { elapsed: 1500 }, ctx, idLabels)).toBe('1s 500ms');
    expect(csvCellText('createdAt', { createdAt: '2026-11-27T15:00:00Z' }, ctx, idLabels)).toMatch(/am|pm/i);
    expect(csvCellText('password', { password: 'super-secret-value' }, ctx, idLabels)).toBe(SECRET_MASK);
    expect(csvCellText('domainId', { domainId: 'd1' }, ctx, idLabels)).toBe('hilmail.co');
    expect(csvCellText('domainIds', { domainIds: { d1: true, d2: true } }, ctx, idLabels)).toBe('hilmail.co, d2');
    expect(csvCellText('tags', { tags: { a: true, b: true } }, ctx, idLabels)).toBe('a, b');
    expect(csvCellText('missing', {}, ctx, idLabels)).toBe('');
  });

  it('batch-resolves objectId labels and falls back to raw IDs on errors', async () => {
    const labels = await resolveCsvIdLabels(
      [{ domainId: 'd1', domainIds: { d1: true, d2: true } }],
      [{ name: 'domainId' }, { name: 'domainIds' }],
      { schema, fields },
    );

    expect(labels.get('x:Domain\u0000d1')).toBe('hilmail.co');
    expect(labels.has('x:Domain\u0000d2')).toBe(false);
  });
});

/*
 * SPDX-FileCopyrightText: 2020 Stalwart Labs LLC <hello@stalw.art>
 *
 * SPDX-License-Identifier: AGPL-3.0-only OR LicenseRef-SEL
 */

import { beforeEach, describe, expect, it, vi } from 'vitest';
import { QueryClient } from '@tanstack/react-query';

import { fetchAllRowsQuery } from '@/data/listAll';
import { jmapGetBatched, jmapQueryAll } from '@/services/jmap/client';
import { useAuthStore } from '@/stores/authStore';

const mockApiFetchJson = vi.fn();

vi.mock('@/services/api', () => ({
  apiFetchJson: (...args: unknown[]) => mockApiFetchJson(...args),
}));

describe('JMAP query/get fork enhancements', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    useAuthStore.setState({
      apiUrl: '/jmap',
      primaryAccountId: 'primary',
      accounts: { primary: { name: 'admin', isPersonal: false, hasManagement: true } },
      maxObjectsInGet: 2,
    });
  });

  it('reorders jmapGetBatched results to match input query IDs order', async () => {
    mockApiFetchJson
      .mockResolvedValueOnce({
        methodResponses: [
          [
            'x:Log/get',
            {
              accountId: 'primary',
              state: 's1',
              list: [
                { id: 'id-2', details: 'second' },
                { id: 'id-1', details: 'first' },
              ],
            },
            '0',
          ],
        ],
      })
      .mockResolvedValueOnce({
        methodResponses: [
          [
            'x:Log/get',
            {
              accountId: 'primary',
              state: 's1',
              list: [{ id: 'id-3', details: 'third' }],
            },
            '0',
          ],
        ],
      });

    const items = await jmapGetBatched('x:Log', ['id-1', 'id-2', 'id-3'], ['id', 'details']);
    expect(items.map((item) => item.id)).toEqual(['id-1', 'id-2', 'id-3']);
  });

  it('stops jmapQueryAll once maxIds cap is reached', async () => {
    mockApiFetchJson.mockResolvedValueOnce({
      methodResponses: [
        [
          'x:Log/query',
          {
            accountId: 'primary',
            queryState: 'q1',
            canCalculateChanges: false,
            position: 0,
            ids: ['l1', 'l2', 'l3'],
            limit: 3,
          },
          '0',
        ],
      ],
    });

    const ids = await jmapQueryAll('x:Log', {}, { maxIds: 3 });
    expect(ids).toEqual(['l1', 'l2', 'l3']);
    // Must not issue a second anchor page request after reaching maxIds.
    expect(mockApiFetchJson).toHaveBeenCalledTimes(1);
  });

  it('skips probeQueryTotal on x:Log in fetchAllRowsQuery and requests up to 2000 entries', async () => {
    mockApiFetchJson
      .mockResolvedValueOnce({
        methodResponses: [
          [
            'x:Log/query',
            {
              accountId: 'primary',
              queryState: 'q1',
              canCalculateChanges: false,
              position: 0,
              ids: ['l1'],
              limit: null,
            },
            '0',
          ],
        ],
      })
      .mockResolvedValueOnce({
        methodResponses: [
          [
            'x:Log/get',
            {
              accountId: 'primary',
              state: 's1',
              list: [{ id: 'l1', details: 'entry' }],
            },
            '0',
          ],
        ],
      });

    const queryDef = fetchAllRowsQuery('x:Log', { properties: ['id', 'details'] });
    const client = new QueryClient();
    const list = await client.fetchQuery(queryDef);

    expect(list).toEqual([{ id: 'l1', details: 'entry' }]);
    // First call is directly /query (with limit 2000), skipping any extra limit=1 probe request.
    const firstOptions = mockApiFetchJson.mock.calls[0][1] as { body: string };
    const parsedBody = JSON.parse(firstOptions.body) as { methodCalls: Array<[string, Record<string, unknown>]> };
    expect(parsedBody.methodCalls[0][1].limit).toBe(2000);
    expect(mockApiFetchJson).toHaveBeenCalledTimes(2);
  });
});

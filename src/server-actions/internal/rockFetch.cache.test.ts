import { beforeEach, describe, expect, it, jest } from '@jest/globals';

jest.mock('@/auth0-hooks/server/assertAuthenticated', () => ({
  assertAuthenticated: jest.fn(async () => undefined),
}));
jest.mock('@/server-actions/internal/rockObjectCache', () => ({
  readRockObjectCache: jest.fn(async () => ({ hit: false })),
  writeRockObjectCache: jest.fn(async () => undefined),
  bustRockObjectCache: jest.fn(async () => undefined),
}));
jest.mock('next/cache', () => ({ revalidateTag: jest.fn() }));

import { revalidateTag } from 'next/cache';
import { rockGet, rockPatch } from './rockFetch';

const revalidateTagMock = revalidateTag as unknown as jest.Mock;

/**
 * A runsheet is read from `/ContentChannelItems?loadAttributes=simple`, but a cell
 * edit only writes `/AttributeValues/{id}`. The cached read must be purged by that
 * write, or a saved runsheet reads back as its pre-save version.
 */
describe('rockFetch Data Cache invalidation', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    global.fetch = jest.fn(async () => new Response('[]', { status: 200 })) as any;
  });

  it('purges a cached runsheet read when only an AttributeValue is written', async () => {
    await rockGet('/ContentChannelItems', {
      $filter: 'ContentChannelId eq 1',
      loadAttributes: 'simple',
    });
    const readOptions = (global.fetch as jest.Mock).mock.calls[0][1] as RequestInit;
    const readTags = readOptions.next?.tags ?? [];

    await rockPatch('/AttributeValues/5', { Value: 'edited' });

    const purgedTags = revalidateTagMock.mock.calls.map(([tag]) => tag);
    expect(readTags.some((tag) => purgedTags.includes(tag))).toBe(true);
  });

  it('still purges the written entity own tag', async () => {
    await rockPatch('/ContentChannelItems/9', { Order: 2 });

    expect(revalidateTagMock).toHaveBeenCalledWith('rock:contentchannelitems');
  });

  it('does not purge anything for a read', async () => {
    await rockGet('/ContentChannelItems', { $top: 1 });

    expect(revalidateTagMock).not.toHaveBeenCalled();
  });
});

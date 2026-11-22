import { afterEach, beforeEach, describe, expect, it, jest } from '@jest/globals';
import { QueryClient } from 'react-query';

jest.mock('@/server-actions/rockGetRunsheetDetails', () => ({ rockGetRunsheetDetails: jest.fn() }));
jest.mock('@/server-actions/rockGetAvailableRunsheetChannels', () => ({ rockGetAvailableRunsheetChannels: jest.fn() }));
jest.mock('@/server-actions/rockGetRosterAssignments', () => ({ rockGetRosterAssignments: jest.fn() }));

import { rockGetRunsheetDetails } from '@/server-actions/rockGetRunsheetDetails';
import { refreshRunsheetDetailsAfterSave, runsheetQueryKeys } from './runsheetQueries';

const mockDetails = jest.mocked(rockGetRunsheetDetails);

const ok = (label: string) => ({ success: true, data: { channelId: 1, name: label } }) as any;

describe('refreshRunsheetDetailsAfterSave', () => {
  let queryClient: QueryClient;
  const key = runsheetQueryKeys.details(1, 'scope');

  beforeEach(() => {
    jest.clearAllMocks();
    queryClient = new QueryClient();
  });

  afterEach(() => {
    // Drops the cache-cleanup timers, which would otherwise keep Jest from exiting.
    queryClient.clear();
  });

  it('reads fresh from Rock and stores the result as the runsheet', async () => {
    mockDetails.mockResolvedValue(ok('after save'));

    await refreshRunsheetDetailsAfterSave(queryClient, 1, 'scope');

    expect(mockDetails).toHaveBeenCalledWith(1, true);
    expect(queryClient.getQueryData(key)).toEqual(ok('after save'));
  });

  it('keeps the cached runsheet and marks it stale when the fresh read fails', async () => {
    queryClient.setQueryData(key, ok('optimistic'));
    mockDetails.mockResolvedValue({ success: false, error: 'boom' } as any);
    const invalidate = jest.spyOn(queryClient, 'invalidateQueries');

    await refreshRunsheetDetailsAfterSave(queryClient, 1, 'scope');

    expect(queryClient.getQueryData(key)).toEqual(ok('optimistic'));
    expect(invalidate).toHaveBeenCalledWith(key);
  });

  it('applies overlapping reloads in save order, not arrival order', async () => {
    let releaseFirst!: (value: unknown) => void;
    mockDetails
      .mockImplementationOnce(() => new Promise((resolve) => (releaseFirst = resolve)) as any)
      .mockResolvedValueOnce(ok('second save'));

    const first = refreshRunsheetDetailsAfterSave(queryClient, 1, 'scope');
    await refreshRunsheetDetailsAfterSave(queryClient, 1, 'scope');
    releaseFirst(ok('first save'));
    await first;

    expect(queryClient.getQueryData(key)).toEqual(ok('second save'));
  });
});

import 'server-only';

import assert from 'assert';
import { isObject } from 'lodash';
import { getServerSession } from './getServerSession';

/**
 * Verify the user has an active Auth0 session.
 * Authorization (role checks) is handled separately by getAuthAccess, getAuthConnectGroups, etc.
 */
export const assertAuthenticated = async () => {
  const session = await getServerSession();
  assert(isObject(session?.user), 'user must be authenticated');
};

'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { RockGroupMember, RockGroupMemberStatus } from '@/types/RockGroupMember';
import { number, object } from 'zod';
import { rockPerformTeamJoin } from './rockPerformTeamJoin';
import { rockPerformTeamLeave } from './rockPerformTeamLeave';
import { serverLog } from '@/lib/serverLog';

const log = serverLog('rockPerformTeamTransfer');

export interface RockTransferPayload {
  personId: number;
  fromGroupId: number;
  toGroupId: number;
}

const schema = object({
  personId: number().int().positive(),
  fromGroupId: number().int().positive(),
  toGroupId: number().int().positive(),
});

/**
 * Transfer a person from one group to another.
 * Replaces fluroPerformTeamTransfer.
 *
 * Joins the target group first, then leaves the source group.
 * If leaving fails, rolls back the join.
 */
export async function rockPerformTeamTransfer(args: RockTransferPayload) {
  await assertAuthenticated();
  const { personId, fromGroupId, toGroupId } = schema.parse(args);

  if (fromGroupId === toGroupId) {
    throw new Error('Transferring to the same connect group is not possible');
  }

  // Verify person is a member of the source group
  const allSourceMembers: RockGroupMember[] = await rockGet('/GroupMembers', {
    $filter: `GroupId eq ${fromGroupId} and PersonId eq ${personId}`,
    $select: 'Id,GroupMemberStatus',
  });
  const sourceMember = allSourceMembers.find((m) => m.GroupMemberStatus === RockGroupMemberStatus.Active);

  if (!sourceMember) {
    throw new Error(`Person ${personId} is not an active member of group ${fromGroupId}`);
  }

  const sourceMemberId = sourceMember.Id;

  // Join target group first
  log.debug('JOINING', toGroupId, '...');
  await rockPerformTeamJoin({ personId, groupId: toGroupId });

  try {
    // If join succeeded, leave source group
    log.debug('LEAVING', fromGroupId, '...');
    await rockPerformTeamLeave(sourceMemberId);
    log.debug('SUCCESSFUL TRANSFER', personId, '[', fromGroupId, '=>', toGroupId, ']');
  } catch (err) {
    // Rollback: remove from target group
    log.debug('ERROR IN LEAVING SOURCE GROUP, rolling back join to', toGroupId);
    const targetMembers: RockGroupMember[] = await rockGet('/GroupMembers', {
      $filter: `GroupId eq ${toGroupId} and PersonId eq ${personId}`,
      $select: 'Id',
      $top: 1,
    });
    if (targetMembers.length) {
      await rockPerformTeamLeave(targetMembers[0].Id);
    }
    throw err;
  }
}

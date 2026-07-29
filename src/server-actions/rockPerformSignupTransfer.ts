'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import { rockUpsertEntityAttributeValue } from '@/server-actions/internal/rockConnectGroupAttributes';
import { rockGet, rockPatch } from '@/server-actions/internal/rockFetch';
import { rockSetSignupStatus } from './rockSetSignupStatus';
import { rockSetWorkflowSignupStatus } from './rockSetWorkflowSignupStatus';
import { ROCK_WORKFLOW_ENTITY_TYPE_ID } from '@/constants/client';
import { number, object, string } from 'zod';
import { revalidateTag } from 'next/cache';
import { rockClearGroupHierarchyCache } from './rockGetGroupHierarchy';

const schema = object({
  signupId: number().int().positive(),
  sourceType: string().regex(/^(registration|workflow)$/),
  fromGroupId: number().int().positive(),
  toGroupId: number().int().positive(),
});

export async function rockPerformSignupTransfer(args: {
  signupId: number;
  sourceType: 'registration' | 'workflow';
  fromGroupId: number;
  toGroupId: number;
}) {
  await assertAuthenticated();
  const { signupId, sourceType, fromGroupId, toGroupId } = schema.parse(args);

  // Check authorization for both source and destination groups
  await assertAccessibleGroupId(fromGroupId);
  await assertAccessibleGroupId(toGroupId);

  if (fromGroupId === toGroupId) {
    throw new Error('Transferring to the same connect group is not possible');
  }

  // 1. Get source and target group names
  const [fromGroup, toGroup] = await Promise.all([
    rockGet(`/Groups/${fromGroupId}`, { $select: 'Name' }),
    rockGet(`/Groups/${toGroupId}`, { $select: 'Name' }),
  ]);

  const transferMeta = {
    from: { id: fromGroupId, name: fromGroup?.Name || 'Unknown Group' },
    to: { id: toGroupId, name: toGroup?.Name || 'Unknown Group' },
  };
  const foreignKeyStr = JSON.stringify(transferMeta);

  // 2. Update group reference and status
  if (sourceType === 'workflow') {
    // Find connectGroup attribute definition ID for workflows
    const attribute = (await rockGet('/Attributes', {
      $filter: `Key eq 'connectGroup' and EntityTypeId eq ${ROCK_WORKFLOW_ENTITY_TYPE_ID}`,
      $select: 'Id',
      $top: 1,
    })) as any[];

    if (!attribute.length) {
      throw new Error('connectGroup attribute for workflows not found in Rock');
    }

    // Update connectGroup attribute value on workflow
    await rockUpsertEntityAttributeValue(signupId, attribute[0].Id, String(toGroupId));

    // Update workflow ForeignKey metadata
    await rockPatch(`/Workflows/${signupId}`, {
      ForeignKey: foreignKeyStr,
    });

    // Reactivate/unarchive the workflow signup
    await rockSetWorkflowSignupStatus(signupId, 'active');
    revalidateTag('rock:workflows');
  } else {
    // Update GroupId and ForeignKey on Registration and mark active
    await rockPatch(`/Registrations/${signupId}`, {
      GroupId: toGroupId,
      IsTemporary: false,
      ForeignKey: foreignKeyStr,
    });

    // Reactivate/unarchive the registration signup (removing archive tag)
    await rockSetSignupStatus(signupId, 'active');
    revalidateTag('rock:registrations');
  }

  await rockClearGroupHierarchyCache();
}

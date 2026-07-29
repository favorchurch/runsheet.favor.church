'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertAccessibleGroupId } from '@/auth0-hooks/server/assertAccessibleGroupId';
import {
  ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID,
  ROCK_WORKFLOW_ENTITY_TYPE_ID,
} from '@/constants/client';
import { rockUpsertEntityAttributeValue } from '@/server-actions/internal/rockConnectGroupAttributes';
import { rockGet } from '@/server-actions/internal/rockFetch';
import {
  WORKFLOW_SIGNUP_ARCHIVED_ATTRIBUTE_KEY,
} from '@/types/WorkflowSignupStatus';
import { revalidateTag } from 'next/cache';
import { boolean, number, object } from 'zod';

const schema = object({
  workflowId: number().int().positive(),
  archived: boolean(),
});

type RockAttributeDefinition = {
  Id: number;
  Key?: string | null;
  EntityTypeQualifierColumn?: string | null;
  EntityTypeQualifierValue?: string | null;
};

type RockWorkflowAttributeValue = {
  Value: string | null;
};

async function getWorkflowArchivedAttributeId(): Promise<number> {
  const attributes = (await rockGet('/Attributes', {
    $filter: `Key eq '${WORKFLOW_SIGNUP_ARCHIVED_ATTRIBUTE_KEY}' and EntityTypeId eq ${ROCK_WORKFLOW_ENTITY_TYPE_ID}`,
    $select: 'Id,Key,EntityTypeQualifierColumn,EntityTypeQualifierValue',
    $top: 10,
  })) as RockAttributeDefinition[];

  const attribute =
    attributes.find(
      (item) =>
        item.EntityTypeQualifierColumn === 'WorkflowTypeId' &&
        item.EntityTypeQualifierValue === String(ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID)
    ) ||
    attributes.find((item) => item.Key === WORKFLOW_SIGNUP_ARCHIVED_ATTRIBUTE_KEY) ||
    attributes[0];

  if (!attribute?.Id) {
    throw new Error(
      `connectPortalArchived workflow attribute was not found for WorkflowTypeId ${ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID}. Create it on the workflow type attributes, keep it visible on the workflow entry, and do not add it to the form builder.`
    );
  }

  return attribute.Id;
}

async function getWorkflowConnectGroupId(workflowId: number): Promise<number | undefined> {
  const workflow = (await rockGet(`/Workflows/${workflowId}`, {
    $select: 'Id',
    LoadAttributes: true,
  })) as any;

  if (!workflow?.AttributeValues?.connectGroup) {
    return undefined;
  }

  const groupIdStr = (workflow.AttributeValues.connectGroup as RockWorkflowAttributeValue)?.Value;
  if (!groupIdStr) return undefined;

  const groupId = parseInt(groupIdStr, 10);
  return Number.isInteger(groupId) && groupId > 0 ? groupId : undefined;
}

export async function rockSetWorkflowSignupArchived(
  workflowId: number,
  archived: boolean
): Promise<void> {
  await assertAuthenticated();
  const parsed = schema.parse({ workflowId, archived });

  // Resolve and check access to the owning group
  const groupId = await getWorkflowConnectGroupId(parsed.workflowId);
  if (groupId) {
    await assertAccessibleGroupId(groupId as number);
  }

  const attributeId = await getWorkflowArchivedAttributeId();

  await rockUpsertEntityAttributeValue(
    parsed.workflowId,
    attributeId,
    parsed.archived ? 'True' : 'False'
  );

  revalidateTag('rock:workflows');
}

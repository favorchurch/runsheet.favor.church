'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { getAuthConnectGroups } from '@/auth0-hooks/server/getAuthConnectGroups';
import { rockGetSignupsForGroupMultiple } from './rockGetSignupsForGroupMultiple';
import { rockGetWorkflowSignupsForGroupMultiple } from './rockGetWorkflowSignupsForGroupMultiple';

export async function rockGetAuthConnectSignupsCount() {
  await assertAuthenticated();
  const groups = await getAuthConnectGroups();
  const [registrations, workflows] = await Promise.all([
    rockGetSignupsForGroupMultiple(groups, '2023-12'),
    rockGetWorkflowSignupsForGroupMultiple(groups, '2023-12'),
  ]);

  const isArchived = (r: any) =>
    !!r.IsTemporary ||
    r.AttributeValues?.connectPortalArchived?.Value === 'True' ||
    !!r.isAlreadyAdded ||
    r.RegistrantPersonAlias?.Person?.RecordStatusValueId === 4 ||
    r.RegistrantPersonAlias?.Person?.IsDeceased === true;

  return registrations.filter(r => !isArchived(r)).length
       + workflows.filter(w => !isArchived(w)).length;
}


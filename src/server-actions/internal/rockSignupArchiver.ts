import 'server-only';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { RockRegistration } from '@/types/RockRegistration';
import { RockWorkflowSignup } from '@/types/RockWorkflow';
import { rockSetSignupStatus } from '../rockSetSignupStatus';
import { rockSetWorkflowSignupArchived } from '../rockSetWorkflowSignupArchived';
import { serverLog } from '@/lib/serverLog';

const log = serverLog('rockSignupArchiver');

export async function rockSignupArchiver(
  registration: RockRegistration,
  memberPersonIds: Set<number>
): Promise<RockRegistration> {
  await assertAuthenticated();

  const personId = registration.RegistrantPersonAlias?.PersonId;
  const isAlreadyAdded = !!(personId && memberPersonIds.has(personId));
  (registration as any).isAlreadyAdded = isAlreadyAdded;

  const signupDate = new Date(registration.CreatedDateTime || new Date());
  const days = (new Date().getTime() - signupDate.getTime()) / (1000 * 3600 * 24);
  const isTaggedButOld = !!(days > 30 && registration.tags && registration.tags.length > 0);

  const isCurrentlyArchived = !!registration.IsTemporary;

  if (!isCurrentlyArchived && (isAlreadyAdded || isTaggedButOld)) {
    log.debug(
      'Archiving registration:',
      registration.Id,
      'isAlreadyAdded:',
      isAlreadyAdded,
      'isTaggedButOld:',
      isTaggedButOld
    );
    await rockSetSignupStatus(registration.Id, 'archived');
    registration.IsTemporary = true;
  }

  return registration;
}

export async function rockWorkflowSignupArchiver(
  workflow: RockWorkflowSignup,
  memberPersonIds: Set<number>
): Promise<RockWorkflowSignup> {
  await assertAuthenticated();

  const personId = workflow.RegistrantPersonAlias?.PersonId;
  const isAlreadyAdded = !!(personId && memberPersonIds.has(personId));
  (workflow as any).isAlreadyAdded = isAlreadyAdded;

  const signupDate = new Date(workflow.CreatedDateTime || new Date());
  const days = (new Date().getTime() - signupDate.getTime()) / (1000 * 3600 * 24);
  const isTaggedButOld = !!(days > 30 && workflow.tags && workflow.tags.length > 0);

  // Check if currently archived via the archive attribute
  const isCurrentlyArchived = workflow.AttributeValues?.connectPortalArchived?.Value === 'True';

  if (!isCurrentlyArchived && (isAlreadyAdded || isTaggedButOld)) {
    log.debug(
      'Archiving workflow signup:',
      workflow.Id,
      'isAlreadyAdded:',
      isAlreadyAdded,
      'isTaggedButOld:',
      isTaggedButOld
    );
    await rockSetWorkflowSignupArchived(workflow.Id, true);
  }

  return workflow;
}

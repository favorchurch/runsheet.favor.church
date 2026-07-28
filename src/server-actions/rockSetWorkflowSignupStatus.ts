'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { revalidateTag } from 'next/cache';
import { number, object } from 'zod';
import { rockSetWorkflowSignupArchived } from './rockSetWorkflowSignupArchived';

const schema = object({ workflowId: number().int().positive() });

/**
 * DEPRECATED: This function is maintained for backward compatibility.
 * Use rockSetWorkflowSignupArchived() instead.
 *
 * Archive/activate a workflow signup using the dedicated archive attribute.
 */
export async function rockSetWorkflowSignupStatus(
  workflowId: number,
  status: 'active' | 'archived'
): Promise<void> {
  await assertAuthenticated();
  schema.parse({ workflowId });

  await rockSetWorkflowSignupArchived(workflowId, status === 'archived');
  revalidateTag('rock:workflows');
}

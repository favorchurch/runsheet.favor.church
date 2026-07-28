'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockHydrateRegistrationAliases } from '@/server-actions/internal/rockHydrateRegistrationAliases';
import { rockHydrateRegistrationTags } from '@/server-actions/internal/rockHydrateRegistrationTags';
import { RockRegistration } from '@/types/RockRegistration';
import { number, object } from 'zod';

const schema = object({
  registrationId: number().int().positive(),
});

/**
 * Get a single registration (signup) by ID.

 * Replaces fluroGetConnectSignupById.
 */
export async function rockGetSignupById(registrationId: number): Promise<RockRegistration> {
  await assertAuthenticated();
  schema.parse({ registrationId });
  const registration = (await rockGet(`/Registrations/${registrationId}`, {
    $expand: 'RegistrationInstance',
    $select: 'Id,Guid,RegistrationInstanceId,PersonAliasId,GroupId,CreatedDateTime,ModifiedDateTime,IsTemporary',
  }, true)) as RockRegistration;


  const [hydratedWithAliases] = await rockHydrateRegistrationAliases([registration]);
  const [hydratedWithTags] = await rockHydrateRegistrationTags([hydratedWithAliases], true);
  return hydratedWithTags;
}

'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { rockHydrateRegistrationAliases } from '@/server-actions/internal/rockHydrateRegistrationAliases';
import { rockHydrateRegistrationTags } from '@/server-actions/internal/rockHydrateRegistrationTags';
import { RockRegistration } from '@/types/RockRegistration';
import { number, object, string } from 'zod';

const schema = object({
  groupId: number().int().positive(),
  afterDate: string().optional(),
});


export async function rockGetSignupsForGroup(
  groupId: number,
  afterDate?: string
): Promise<RockRegistration[]> {
  await assertAuthenticated();
  schema.parse({ groupId, afterDate });

  const filters: string[] = [`GroupId eq ${groupId}`];
  if (afterDate) {
    filters.push(`CreatedDateTime ge datetime'${afterDate}'`);
  }

  const registrations = (await rockGet('/Registrations', {
    $filter: filters.join(' and '),
    $expand: 'RegistrationInstance',
    $select: 'Id,Guid,RegistrationInstanceId,PersonAliasId,GroupId,CreatedDateTime,ModifiedDateTime,IsTemporary',
    $orderby: 'CreatedDateTime desc',
    $top: 50,
  }, true)) as RockRegistration[];

  const hydratedWithAliases = await rockHydrateRegistrationAliases(registrations);
  const hydratedWithTags = await rockHydrateRegistrationTags(hydratedWithAliases, true);

  // Get active group members to check if registrant is already added
  const members = (await rockGet('/GroupMembers', {
    $filter: `GroupId eq ${groupId} and GroupMemberStatus eq '1'`,
    $select: 'PersonId',
  }, true)) as { PersonId: number }[];
  const memberPersonIds = new Set(members.map((m) => m.PersonId));

  const { rockSignupArchiver } = await import('./internal/rockSignupArchiver');
  await Promise.all(hydratedWithTags.map((r) => rockSignupArchiver(r, memberPersonIds)));

  return hydratedWithTags;
}


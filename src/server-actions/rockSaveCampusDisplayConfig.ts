'use server';

import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { assertHasRole } from '@/auth0-hooks/server/assertHasRole';
import {
  campusDisplayConfigSchema,
  type CampusDisplayConfig,
} from '@/lib/connectSignupsDisplayConfig';
import { clearCampusDisplayConfigsCache } from '@/server-actions/rockGetCampusDisplayConfigs';
import { getAuthDepartmentScope } from '@/server-actions/getAuthDepartmentScope';
import { rockUpsertEntityAttributeValue } from '@/server-actions/internal/rockConnectGroupAttributes';
import { rockGet } from '@/server-actions/internal/rockFetch';
import { ConnectRole } from '@/types/ConnectRole';

const ATTRIBUTE_KEY = 'ConnectSignupsDisplayConfig';

interface RockEntityType {
  Id: number;
}

interface RockAttributeDefinition {
  Id: number;
}

let cachedAttributeId: number | null = null;

async function rockGetCampusDisplayConfigAttributeId(): Promise<number> {
  if (cachedAttributeId) return cachedAttributeId;

  const entityTypes = (await rockGet('/EntityTypes', {
    $filter: "Name eq 'Rock.Model.Campus'",
    $select: 'Id,Name',
    $top: 1,
  })) as RockEntityType[];
  const campusEntityTypeId = entityTypes[0]?.Id;
  if (!campusEntityTypeId) {
    throw new Error('Could not resolve Rock Campus EntityTypeId');
  }

  const attributes = (await rockGet('/Attributes', {
    $filter: `Key eq '${ATTRIBUTE_KEY}' and EntityTypeId eq ${campusEntityTypeId}`,
    $select: 'Id,Key,EntityTypeId',
    $top: 1,
  })) as RockAttributeDefinition[];
  const attributeId = attributes[0]?.Id;
  if (!attributeId) {
    throw new Error(
      `Missing ${ATTRIBUTE_KEY} Campus attribute. Run pnpm provision:signups-display-config first.`,
    );
  }

  cachedAttributeId = attributeId;
  return attributeId;
}

export async function rockSaveCampusDisplayConfig(
  shortCode: string,
  config: CampusDisplayConfig,
): Promise<void> {
  await assertAuthenticated();
  await assertHasRole(ConnectRole.DepartmentHead);

  const normalizedShortCode = shortCode.trim().toUpperCase();
  const scope = await getAuthDepartmentScope();
  const campus = scope.campusOptions.find(
    (option) => option.shortCode?.trim().toUpperCase() === normalizedShortCode,
  );
  if (!campus) {
    throw new Error('The requested campus is not in your department scope.');
  }

  const validated = campusDisplayConfigSchema.parse(config);
  const attributeId = await rockGetCampusDisplayConfigAttributeId();
  await rockUpsertEntityAttributeValue(
    campus.id,
    attributeId,
    JSON.stringify(validated),
  );
  clearCampusDisplayConfigsCache();
}

'use server';

import { CONNECT_GROUP_ATTRIBUTE_KEYS, CONNECT_GROUP_ATTRIBUTE_SPECS } from '@/connectGroupAttributes';
import {
  buildConnectGroupFormFields,
  CONNECT_GROUP_DEFAULT_POSITIONS,
} from '@/components/ConnectGroupForm/connectGroupDefinition';
import { assertAuthenticated } from '@/auth0-hooks/server/assertAuthenticated';
import { FormField } from '@/types/FormField';

/**
 * Get the Connect Group type definition backed by the canonical attribute manifest.
 */
export async function rockGetConnectGroupDefinition(): Promise<{
  attributes: typeof CONNECT_GROUP_ATTRIBUTE_SPECS;
  attributeKeys: typeof CONNECT_GROUP_ATTRIBUTE_KEYS;
  fields: FormField[];
  data: {
    defaultPositions: typeof CONNECT_GROUP_DEFAULT_POSITIONS;
  };
}> {
  await assertAuthenticated();

  return {
    attributes: CONNECT_GROUP_ATTRIBUTE_SPECS,
    attributeKeys: CONNECT_GROUP_ATTRIBUTE_KEYS,
    fields: buildConnectGroupFormFields(),
    data: {
      defaultPositions: CONNECT_GROUP_DEFAULT_POSITIONS,
    },
  };
}

/**
 * Get the Connect Group type attribute definitions (fields).
 */
export async function rockGetConnectGroupDefinitionFields(): Promise<FormField[]> {
  await assertAuthenticated();
  return buildConnectGroupFormFields();
}

import { UserProfile } from '@auth0/nextjs-auth0/client';

export interface AuthContact {
  id: number;
  primaryAliasId?: number;
  firstName?: string;
  lastName?: string;
  nickName?: string;
  fullName?: string;
  email?: string;
  campusId?: number | null;
}

/**
 * A Connect group section (Rock GroupType 24) the user has some authority over.
 *
 * `kind` is derived from the section's name — Rock encodes the level in the
 * title, e.g. `Region // North` or `Cluster // Ortigas`.
 */
export interface SectionAccess {
  sectionId: number;
  name: string;
  campusId?: number | null;
  kind: 'region' | 'cluster' | 'department';
}

/**
 * What the signed-in user may reach.
 *
 * The section and group fields are inherited from the Connect portal this app
 * was split out of. `rockResolveAccess` only resolves `campusIds` here, so the
 * others are always empty — the section-scoped helpers in `auth0-hooks/server`
 * are dormant until that resolver is extended again.
 */
export interface AuthAccess {
  campusIds: number[];
  connectLeaderGroupIds: number[];
  regionalLeaderSections: SectionAccess[];
  clusterHeadSections: SectionAccess[];
  departmentHeadSections: SectionAccess[];
}

export type AuthRolesMap = Record<string, string[]>;

export type AuthUser = UserProfile & {
  contact?: AuthContact,
  contacts?: string[],
  rolesMap?: AuthRolesMap,
  access?: AuthAccess,
};

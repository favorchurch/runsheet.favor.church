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

export interface AuthAccess {
  campusIds: number[];
}

export type AuthRolesMap = Record<string, string[]>;

export type AuthUser = UserProfile & {
  contact?: AuthContact,
  contacts?: string[],
  rolesMap?: AuthRolesMap,
  access?: AuthAccess,
};

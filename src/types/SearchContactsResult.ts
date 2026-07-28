import { PortalContact } from './PortalModels';

export interface SearchContactsResult
  extends Pick<
    PortalContact,
    | '_id'
    | 'firstName'
    | 'lastName'
    | 'title'
    | 'preferredName'
    | 'Email'
    | 'Gender'
    | 'BirthDate'
    | 'PhoneNumbers'
  > {
  Id?: number;
  PrimaryAliasId?: number;
}

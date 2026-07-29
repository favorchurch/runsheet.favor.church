import { ROCK_WORKFLOW_ENTITY_TYPE_ID } from '@/constants/client';
import { getTimezoneForCampus } from '@/providers/CampusContext/getTimezoneForCampus';
import { RockWorkflowSignup, workflowGroupId, workflowSignupStatus, workflowIsArchived } from './RockWorkflow';
import { RockRegistration } from './RockRegistration';
import { portalStringId } from './portalStringId';
import { PortalContact, normalizePortalContact } from './PortalContact';
import { PortalConnectGroup } from './PortalConnectGroup';
import { WorkflowSignupStatus } from './WorkflowSignupStatus';

export interface PortalSignupData {
  contact: PortalContact | string;
  connectGroupId: { _id: string; title: string } | string;
  processes: 'Adults' | 'Young Adults' | 'Seasoned' | 'Youth' | 'Deaf';
  location?: string[];
  transfer?: {
    from: { _id: string; title: string };
    to: { _id: string; title: string };
  };
}

export interface PortalSignupRawData {
  contact: {
    firstName: string;
    lastName: string;
    email: string;
    phoneNumber: string;
    gender: 'male' | 'female';
    dob: string;
    timezone: string;
    details: {
      socialMediaLink: {
        data: {
          facebookLink: string;
        };
      };
    };
  };
  connectGroupId: string;
  processes: 'Adults' | 'Young Adults' | 'Seasoned' | 'Youth' | 'Deaf';
  location?: string;
}

export type PortalSignup = Omit<RockRegistration, 'tags'> & {
  _id?: string;
  title?: string;
  primaryEmail?: string;
  created?: string;
  updated?: string;
  status?: 'active' | 'draft' | 'archived' | 'deleted';
  tags?: string[];
  contacts?: PortalContact[];
  data: PortalSignupData;
  rawData?: PortalSignupRawData;
  /** Where this signup came from — routes status/archive writes to the right Rock entity. */
  sourceType?: 'registration' | 'workflow';
  signupStatus?: WorkflowSignupStatus;
  /** For workflows: whether the connectPortalArchived attribute is true */
  archived?: boolean;
};

function inferProcess(group?: PortalConnectGroup): PortalSignupData['processes'] {
  const title = `${group?.title || ''} ${(group?.data?.ageGroup || '')}`.toLowerCase();
  if (title.includes('seasoned')) return 'Seasoned';
  if (title.includes('young adults') || title.includes('young-adult') || title.includes('youngadult')) {
    return 'Young Adults';
  }
  if (title.includes('youth')) return 'Youth';
  if (title.includes('deaf')) return 'Deaf';
  return 'Adults';
}

function parseTransferMetadata(foreignKey: string | null | undefined): PortalSignupData['transfer'] | undefined {
  if (foreignKey && foreignKey.startsWith('{')) {
    try {
      const parsed = JSON.parse(foreignKey);
      if (parsed.from && parsed.to) {
        return {
          from: { _id: String(parsed.from.id), title: parsed.from.name },
          to: { _id: String(parsed.to.id), title: parsed.to.name },
        };
      }
    } catch (_) {}
  }
  return undefined;
}

export function normalizePortalSignup(
  signup: RockRegistration,
  options?: {
    group?: PortalConnectGroup;
    groupLookup?: Record<string, PortalConnectGroup>;
  }
): PortalSignup {
  const contact = normalizePortalContact(signup.RegistrantPersonAlias?.Person || {
    Id: signup.RegistrantPersonAlias?.PersonId || 0,
  });
  const group =
    options?.group ||
    (signup.GroupId ? options?.groupLookup?.[String(signup.GroupId)] : undefined);
  const timezone = group?.CampusId ? getTimezoneForCampus(group.CampusId) : 'Asia/Manila';
  const process = inferProcess(group);
  const rawData: PortalSignupRawData = {
    contact: {
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.Email || '',
      phoneNumber: contact.phoneNumber || '',
      gender: contact.gender || 'male',
      dob: contact.dob || '',
      timezone,
      details: {
        socialMediaLink: {
          data: {
            facebookLink: '',
          },
        },
      },
    },
    connectGroupId: portalStringId(group?._id || signup.GroupId),
    processes: process,
  };

  return {
    ...signup,
    _id: portalStringId(signup.Id),
    title: contact.title,
    primaryEmail: contact.Email,
    created: signup.CreatedDateTime || undefined,
    updated: signup.ModifiedDateTime || signup.CreatedDateTime || undefined,
    status: signup.IsTemporary ? 'archived' : 'active',
    tags: (signup.tags || []).map(String),
    contacts: [contact],
    data: {
      contact,
      connectGroupId: group ? { _id: portalStringId(group), title: group.title || '' } : portalStringId(signup.GroupId),
      processes: process,
      transfer: parseTransferMetadata(signup.ForeignKey),
    },
    rawData,
    sourceType: 'registration',
    signupStatus: undefined,
  };
}

const REGISTRATION_ENTITY_TYPE_ID = 258;

/** Returns the Rock EntityTypeId to use for tag operations on this signup. */
export function getSignupEntityTypeId(signup: Pick<PortalSignup, 'sourceType'>): number {
  return signup.sourceType === 'workflow' ? ROCK_WORKFLOW_ENTITY_TYPE_ID : REGISTRATION_ENTITY_TYPE_ID;
}

/**
 * Normalizes a Rock connect-signup Workflow (type 39) into the shared PortalSignup
 * shape, so it renders identically to registration-based signups.
 */
export function normalizeWorkflowToPortalSignup(
  workflow: RockWorkflowSignup,
  options?: {
    group?: PortalConnectGroup;
    groupLookup?: Record<string, PortalConnectGroup>;
  }
): PortalSignup {
  const contact = normalizePortalContact(
    workflow.RegistrantPersonAlias?.Person || { Id: workflow.RegistrantPersonAlias?.PersonId || 0 }
  );

  const groupId = workflowGroupId(workflow);

  const group =
    options?.group || (groupId ? options?.groupLookup?.[String(groupId)] : undefined);

  const timezone = group?.CampusId ? getTimezoneForCampus(group.CampusId) : 'Asia/Manila';
  const process = inferProcess(group);
  const archived = workflowIsArchived(workflow);

  const rawData: PortalSignupRawData = {
    contact: {
      firstName: contact.firstName || '',
      lastName: contact.lastName || '',
      email: contact.Email || '',
      phoneNumber: contact.phoneNumber || '',
      gender: contact.gender || 'male',
      dob: contact.dob || '',
      timezone,
      details: { socialMediaLink: { data: { facebookLink: '' } } },
    },
    connectGroupId: portalStringId(group?._id || groupId),
    processes: process,
  };

  return {
    // Shape into the RockRegistration fields that PortalSignup extends
    Id: workflow.Id,
    Guid: workflow.Guid,
    RegistrationInstanceId: 0,
    PersonAliasId: workflow.PersonAliasId || 0,
    GroupId: groupId ?? null,
    IsTemporary: false,
    RegistrantPersonAlias: workflow.RegistrantPersonAlias ?? null,
    CreatedDateTime: workflow.CreatedDateTime,
    ModifiedDateTime: workflow.ModifiedDateTime,

    _id: portalStringId(workflow.Id),
    title: contact.title,
    primaryEmail: contact.Email,
    created: workflow.CreatedDateTime || undefined,
    updated: workflow.ModifiedDateTime || workflow.CreatedDateTime || undefined,
    status: archived ? 'archived' : 'active',
    tags: (workflow.tags || []).map(String),
    contacts: [contact],
    data: {
      contact,
      connectGroupId: group
        ? { _id: portalStringId(group), title: group.title || '' }
        : portalStringId(groupId),
      processes: process,
      transfer: parseTransferMetadata(workflow.ForeignKey),
    },
    rawData,
    sourceType: 'workflow',
    signupStatus: workflowSignupStatus(workflow),
    archived,
  };
}

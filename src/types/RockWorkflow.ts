// src/types/RockWorkflow.ts
import { RockPerson } from './RockPerson';
import {
  WORKFLOW_SIGNUP_STATUS_ATTRIBUTE_KEY,
  WORKFLOW_SIGNUP_ARCHIVED_ATTRIBUTE_KEY,
  parseWorkflowSignupStatus,
} from './WorkflowSignupStatus';

export interface RockWorkflowAttributeValue {
  Value: string | null;
  ValueFormatted?: string | null;
  AttributeId?: number;
  EntityId?: number;
}

/** Raw Rock Workflow as returned by /Workflows with LoadAttributes=true (no $select). */
export interface RockWorkflow {
  Id: number;
  Guid?: string;
  Name?: string;
  WorkflowTypeId?: number;
  CampusId?: number | null;
  Status?: string;
  IsProcessing?: boolean;
  ActivatedDateTime?: string | null;
  CompletedDateTime?: string | null;
  CreatedDateTime?: string | null;
  ModifiedDateTime?: string | null;
  InitiatorPersonAliasId?: number | null;
  ForeignKey?: string | null;

  // Present when fetched with LoadAttributes=true AND without $select
  AttributeValues?: Record<string, RockWorkflowAttributeValue | null>;
}

/**
 * A connect-signup workflow after hydration. We attach PersonAlias/Person and tags
 * using the SAME field names PortalModels already reads from RockRegistration, so
 * normalizeWorkflowToPortalSignup can reuse the existing contact-normalization path.
 */
export interface RockWorkflowSignup extends RockWorkflow {
  PersonAliasId?: number;
  RegistrantPersonAlias?: {
    Id: number;
    PersonId: number;
    Person?: RockPerson;
  } | null;
  tags?: number[];
}

/** Reads the connectGroup attribute (GroupId stored as a string) off a workflow. */
export function workflowGroupId(w: RockWorkflowSignup): number | undefined {
  const raw = w.AttributeValues?.connectGroup?.Value;
  if (!raw) return undefined;
  const n = parseInt(raw, 10);
  return Number.isInteger(n) && n > 0 ? n : undefined;
}

export function workflowSignupStatus(w: RockWorkflowSignup) {
  return parseWorkflowSignupStatus(
    w.AttributeValues?.[WORKFLOW_SIGNUP_STATUS_ATTRIBUTE_KEY]?.ValueFormatted ||
      w.AttributeValues?.[WORKFLOW_SIGNUP_STATUS_ATTRIBUTE_KEY]?.Value
  );
}

export function workflowIsArchived(w: RockWorkflowSignup): boolean {
  const value = w.AttributeValues?.[WORKFLOW_SIGNUP_ARCHIVED_ATTRIBUTE_KEY]?.Value;
  if (!value) return false;
  return value.toLowerCase() === 'true' || value === '1';
}

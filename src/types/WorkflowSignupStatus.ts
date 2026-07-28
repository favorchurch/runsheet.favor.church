export const WORKFLOW_SIGNUP_STATUS_ATTRIBUTE_KEY = 'connectPortalStatus';
export const WORKFLOW_SIGNUP_ARCHIVED_ATTRIBUTE_KEY = 'connectPortalArchived';

export const WORKFLOW_SIGNUP_STATUSES = [
  'new',
  'contacted',
  'responsive',
  'unresponsive',
  'duplicate',
] as const;

export type WorkflowSignupStatus = (typeof WORKFLOW_SIGNUP_STATUSES)[number];

const STATUS_LABELS: Record<WorkflowSignupStatus, string> = {
  new: 'New',
  contacted: 'Contacted',
  responsive: 'Responsive',
  unresponsive: 'Unresponsive',
  duplicate: 'Duplicate',
};

const NORMALIZED_STATUS_BY_VALUE: Record<string, WorkflowSignupStatus> = {
  new: 'new',
  contacted: 'contacted',
  responsive: 'responsive',
  responded: 'responsive',
  unresponsive: 'unresponsive',
  'did not push through': 'unresponsive',
  duplicate: 'duplicate',
};

export function workflowSignupStatusLabel(status: WorkflowSignupStatus): string {
  return STATUS_LABELS[status];
}

export function parseWorkflowSignupStatus(value: string | null | undefined): WorkflowSignupStatus {
  const normalized = (value || '').trim().toLowerCase();
  return NORMALIZED_STATUS_BY_VALUE[normalized] || 'new';
}

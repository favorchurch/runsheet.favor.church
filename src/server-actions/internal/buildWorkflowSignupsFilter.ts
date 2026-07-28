// yyyy-MM or yyyy-MM-dd — the only shapes callers pass and Rock accepts as datetime literals.
const AFTER_DATE_RE = /^\d{4}-\d{2}(-\d{2})?$/;

export function buildWorkflowSignupsFilter(workflowTypeId: number, afterDate?: string): string {
  const filters = [`WorkflowTypeId eq ${workflowTypeId}`];
  if (afterDate && AFTER_DATE_RE.test(afterDate)) {
    filters.push(`CreatedDateTime ge datetime'${afterDate}'`);
  }
  return filters.join(' and ');
}

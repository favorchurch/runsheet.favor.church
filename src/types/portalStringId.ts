export function portalStringId(
  value?: string | number | null | { _id?: string | number | null; Id?: number | null; id?: string | number | null }
): string {
  if (typeof value === 'string') return value;
  if (typeof value === 'number') return String(value);
  if (value && typeof value === 'object') {
    if (value._id !== undefined && value._id !== null) return String(value._id);
    if (value.Id !== undefined && value.Id !== null) return String(value.Id);
    if (value.id !== undefined && value.id !== null) return String(value.id);
  }
  return '';
}

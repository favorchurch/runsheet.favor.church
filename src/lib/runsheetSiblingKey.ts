/**
 * Shared identifier stamped on corresponding rows across sibling runsheets
 * (same date/campus, different service time), so row correspondence survives
 * title edits and reordering. Stored as the `SIBLINGKEY` item attribute.
 */
export function generateSiblingKey(): string {
  if (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function') {
    return crypto.randomUUID();
  }
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    const v = c === 'x' ? r : (r & 0x3) | 0x8;
    return v.toString(16);
  });
}

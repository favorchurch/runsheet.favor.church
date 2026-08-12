/**
 * Shared identifier stamped on corresponding rows across sibling runsheets
 * (same date/campus, different service time), so row correspondence survives
 * title edits and reordering. Stored as the `SIBLINGKEY` item attribute.
 */
export function generateSiblingKey(): string {
  return crypto.randomUUID();
}

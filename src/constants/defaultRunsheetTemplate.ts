/**
 * Standard Favor Sunday service runsheet.
 *
 * Values are the same rich-text HTML the cell editor produces, so a template row
 * and a hand-edited row are stored identically in Rock. Rows with `duration: 0`
 * are sub-items of the segment above them and share its time span in the grid.
 */
export interface RunsheetTemplateRow {
  title: string;
  duration: number;
  detail: string;
  activityTitle: string;
}

/** Builds a template row whose title and activity title are the same bold text. */
function segment(name: string, duration: number, detail = ''): RunsheetTemplateRow {
  const heading = `<p><strong>${name}</strong></p>`;
  return { title: heading, activityTitle: heading, duration, detail };
}

/** A sub-item row: no duration of its own, filled in by whoever plans the service. */
function subItem(): RunsheetTemplateRow {
  return { title: '', activityTitle: '', duration: 0, detail: '' };
}

export const DEFAULT_RUNSHEET_TEMPLATE: RunsheetTemplateRow[] = [
  // Pre-service
  segment('Runsheet Huddle', 10),
  segment('All-In Huddle', 15),
  segment('All Teams Prep Doors Open', 5),
  segment('Doors Open', 26),
  segment('Pre-roll Starts', 4),

  // Worship
  segment('Fast Songs', 15),
  subItem(),
  subItem(),
  segment('MC1', 3, '<p>Welcome + Invite for Prayer</p>'),
  segment('Slow Songs', 30),
  subItem(),
  subItem(),
  subItem(),
  segment(
    'MC2',
    5,
    '<p>Pray out of Worship<br>Tithes &amp; Offerings<br>New People<br><strong>Next Steps:</strong></p>',
  ),

  // Word and response
  segment('Just A Minute', 1),
  segment('Sermon', 45),
  segment('Ministry Time / Salvation Altar Call', 15),
  segment('Wrap-up &amp; Announcements', 2),
];

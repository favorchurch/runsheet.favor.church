import { describe, expect, it } from '@jest/globals';
import { resolveGrowAccess } from './growAccessPolicy';

const roleNamesById = new Map([[19, 'Member'], [20, 'Overall Head'], [55, 'Unit Head']]);
const growScheduleIds = new Set([477, 752]);

describe('resolveGrowAccess', () => {
  it('makes Overall Head and Unit Head in 19108 Grow editors', () => {
    for (const groupRoleId of [20, 55]) {
      expect(
        resolveGrowAccess({ memberships: [{ groupId: 19108, groupRoleId }], roleNamesById, rostered: [], growScheduleIds })
          .growEditor,
      ).toBe(true);
    }
  });

  it('does not make a Member or a Head of another team a Grow editor', () => {
    const result = resolveGrowAccess({
      memberships: [{ groupId: 19108, groupRoleId: 19 }, { groupId: 19095, groupRoleId: 20 }],
      roleNamesById,
      rostered: [],
      growScheduleIds,
    });
    expect(result).toEqual({ growEditor: false, growViewer: [] });
  });

  it('keeps only rostered occurrences of Grow schedules', () => {
    const result = resolveGrowAccess({
      memberships: [],
      roleNamesById,
      rostered: [
        { scheduleId: 477, occurrenceDate: '2026-09-29T00:00:00' },
        { scheduleId: 477, occurrenceDate: '2026-09-29T00:00:00' },
        { scheduleId: 311, occurrenceDate: '2026-09-27T00:00:00' },
      ],
      growScheduleIds,
    });
    expect(result.growViewer).toEqual(['477:2026-09-29']);
  });
});

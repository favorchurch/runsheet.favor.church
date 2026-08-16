import { describe, expect, it } from '@jest/globals';
import {
  ALL_CAMPUSES,
  GROUP_TYPE_23_LEADER_ROLE_IDS,
  resolveRunsheetAccessPolicy,
} from './runsheetAccessPolicy';

describe('runsheet access policy', () => {
  it.each([
    ['Rock Administration (2)', 2],
    ['Global Staff (46)', 46],
    ['Dashboard Creator (32879)', 32879],
    ['WEB - Administration (4)', 4],
    ['WEB - General Editor (5)', 5],
  ])('%s grants global edit and all campuses', (_name, groupId) => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId, groupTypeId: 1, groupRoleId: 1 }],
      new Map(),
      new Map(),
    );

    expect(result.editorGroupIds).toEqual([String(groupId)]);
    expect(result.viewerGroupIds).toEqual([String(groupId)]);
    expect(result.runsheetCampuses).toEqual([ALL_CAMPUSES]);
  });

  it('keeps an Events Team Member (role 19) view-only', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 19109, groupTypeId: 23, groupRoleId: 19 }],
      new Map([[19109, { groupId: 19109, groupTypeId: 23, name: 'MNL Events Team', parentGroupId: 57 }]]),
      new Map([[57, { groupId: 57, groupTypeId: 23, parentGroupId: null, campus: 'MNL' }]]),
      new Set([69]),
    );

    expect(result.editorGroupIds).toEqual([]);
    expect(result.viewerGroupIds).toEqual(['19109']);
    expect(result.runsheetCampuses).toEqual(['MNL']);
  });

  it('promotes a YTH Events Team leader to edit its MNL campus', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 32929, groupTypeId: 23, groupRoleId: 69 }],
      new Map([
        [32929, { groupId: 32929, groupTypeId: 23, name: 'YTH Events Team', parentGroupId: 19114 }],
      ]),
      new Map([
        [57, { groupId: 57, groupTypeId: 23, parentGroupId: null, campus: 'MNL' }],
        [19114, { groupId: 19114, groupTypeId: 23, parentGroupId: 57, campus: null }],
      ]),
      new Set([69]),
    );

    expect(result.editorGroupIds).toEqual(['32929']);
    expect(result.viewerGroupIds).toEqual(['32929']);
    expect(result.runsheetCampuses).toEqual(['MNL']);
  });

  it('keeps a non-Events Ministry Team leader view-only', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 19110, groupTypeId: 23, groupRoleId: 69 }],
      new Map([[19110, { groupId: 19110, groupTypeId: 23, name: 'MNL Worship Team', parentGroupId: 57 }]]),
      new Map([[57, { groupId: 57, groupTypeId: 23, parentGroupId: null, campus: 'MNL' }]]),
      new Set([69]),
    );

    expect(result.editorGroupIds).toEqual([]);
    expect(result.viewerGroupIds).toEqual(['19110']);
    expect(result.runsheetCampuses).toEqual(['MNL']);
  });

  it('grants an unlisted GroupType 1 group by its Web Developer name', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 9000, groupTypeId: 1, groupRoleId: 1 }],
      new Map([[9000, { groupId: 9000, groupTypeId: 1, name: 'GLB | Web Developer' }]]),
      new Map(),
    );

    expect(result.editorGroupIds).toEqual(['9000']);
    expect(result.viewerGroupIds).toEqual(['9000']);
    expect(result.runsheetCampuses).toEqual([ALL_CAMPUSES]);
  });

  it('does not grant the Web Developer name to a GroupType 23 team', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 9001, groupTypeId: 23, groupRoleId: 19 }],
      new Map([[9001, { groupId: 9001, groupTypeId: 23, name: 'GLB | Web Developer', parentGroupId: 57 }]]),
      new Map([[57, { groupId: 57, groupTypeId: 23, parentGroupId: null, campus: 'MNL' }]]),
      new Set([69]),
    );

    expect(result.editorGroupIds).toEqual([]);
    expect(result.viewerGroupIds).toEqual(['9001']);
    expect(result.runsheetCampuses).toEqual(['MNL']);
  });

  it('resolves a campus when the authoritative root is absent from fetched groups', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 7002, groupTypeId: 28, groupRoleId: 1 }],
      new Map([[7002, { groupId: 7002, groupTypeId: 28, name: 'MNL Staff', parentGroupId: 32893 }]]),
      new Map(),
      new Set(),
    );

    // The policy API models the resolver's independent root source here.
    const withAuthoritativeRoot = resolveRunsheetAccessPolicy(
      [{ groupId: 7002, groupTypeId: 28, groupRoleId: 1 }],
      new Map([[7002, { groupId: 7002, groupTypeId: 28, name: 'MNL Staff', parentGroupId: 32893 }]]),
      new Map([[32893, { groupId: 32893, groupTypeId: 28, parentGroupId: null, campus: 'MNL' }]]),
      new Set(),
    );

    expect(result.runsheetCampuses).toEqual([]);
    expect(withAuthoritativeRoot.runsheetCampuses).toEqual(['MNL']);
  });

  it('does not cross GroupType ancestry when resolving a campus', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 7003, groupTypeId: 28, groupRoleId: 1 }],
      new Map([
        [7003, { groupId: 7003, groupTypeId: 28, name: 'Unrooted Staff', parentGroupId: 19109 }],
        [19109, { groupId: 19109, groupTypeId: 23, name: 'MNL Events Team', parentGroupId: 57 }],
      ]),
      new Map([[57, { groupId: 57, groupTypeId: 23, parentGroupId: null, campus: 'MNL' }]]),
    );

    expect(result.editorGroupIds).toEqual(['7003']);
    expect(result.runsheetCampuses).toEqual([]);
  });

  it('uses the approved leader-role fallback only when the Rock role lookup failed', () => {
    const result = resolveRunsheetAccessPolicy(
      [{ groupId: 19109, groupTypeId: 23, groupRoleId: GROUP_TYPE_23_LEADER_ROLE_IDS[0] }],
      new Map([[19109, { groupId: 19109, groupTypeId: 23, name: 'MNL Events Team', parentGroupId: 57 }]]),
      new Map([[57, { groupId: 57, groupTypeId: 23, parentGroupId: null, campus: 'MNL' }]]),
      new Set(),
      true,
    );

    expect(result.editorGroupIds).toEqual(['19109']);
    expect(result.usedLeaderRoleFallback).toBe(true);
  });

  it.each([
    {
      name: 'Org Chart staff edits only its campus',
      membership: { groupId: 7001, groupTypeId: 28, groupRoleId: 1 },
      group: { groupId: 7001, groupTypeId: 28, name: 'BNE Staff', parentGroupId: 32898 },
      root: { groupId: 32898, groupTypeId: 28, name: 'Brisbane', parentGroupId: null, campus: 'BNE' as const },
      expectedEditor: ['7001'],
      expectedViewer: ['7001'],
      expectedCampuses: ['BNE'],
    },
    {
      name: 'Potential Captain remains view-only',
      membership: { groupId: 19109, groupTypeId: 23, groupRoleId: 70 },
      group: { groupId: 19109, groupTypeId: 23, name: 'MNL Events Team', parentGroupId: 57 },
      root: { groupId: 57, groupTypeId: 23, name: 'Manila', parentGroupId: null, campus: 'MNL' as const },
      expectedEditor: [],
      expectedViewer: ['19109'],
      expectedCampuses: ['MNL'],
    },
    {
      name: 'unrelated membership is denied',
      membership: { groupId: 9001, groupTypeId: 99, groupRoleId: 1 },
      group: { groupId: 9001, groupTypeId: 99, name: 'Unrelated Group', parentGroupId: null },
      root: undefined,
      expectedEditor: [],
      expectedViewer: [],
      expectedCampuses: [],
    },
  ])('$name', ({ membership, group, root, expectedEditor, expectedViewer, expectedCampuses }) => {
    const groups = new Map([[group.groupId, group]]);
    const roots = root ? new Map([[root.groupId, root]]) : new Map();
    const result = resolveRunsheetAccessPolicy([membership], groups, roots, new Set([69]));

    expect(result.editorGroupIds).toEqual(expectedEditor);
    expect(result.viewerGroupIds).toEqual(expectedViewer);
    expect(result.runsheetCampuses).toEqual(expectedCampuses);
  });
});

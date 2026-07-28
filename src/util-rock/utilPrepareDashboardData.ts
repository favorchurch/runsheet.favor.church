import {
  normalizePortalConnectGroup,
  normalizePortalContact,
  normalizePortalEvent,
  normalizePortalSignup,
  normalizeWorkflowToPortalSignup,
  PortalConnectGroup,
  PortalSignup,
  portalStringId,
} from '@/types/PortalModels';
import { RockEventItemOccurrence } from '@/types/RockEvent';
import { RockGroup } from '@/types/RockGroup';
import { RockRegistration } from '@/types/RockRegistration';
import { RockWorkflowSignup } from '@/types/RockWorkflow';
import { rockConvertGroupsToCampuses } from './utilConvertGroupsToCampuses';
import { rockGetScopedGroupHierarchy } from '@/server-actions/rockGetScopedGroupHierarchy';

export async function normalizeDashboardGroupsAndEvents(rawGroups: RockGroup[], rawEvents: RockEventItemOccurrence[]) {
  const hierarchy = await rockGetScopedGroupHierarchy(rawGroups);
  
  const groups = rawGroups.map((raw) => {
    const group = normalizePortalConnectGroup(raw);
    const node = hierarchy.get(raw.Id);
    if (node) {
      group.regionalLeaders = node.regionalLeaders.map(normalizePortalContact);
      group.clusterHeads = node.clusterHeads.map(normalizePortalContact);
      group.regionId = node.regionId ?? undefined;
      group.regionName = node.regionName ?? undefined;
      group.clusterId = node.clusterId ?? undefined;
      group.clusterName = node.clusterName ?? undefined;
    }
    return group;
  });

  const groupLookup = Object.fromEntries(groups.map((group) => [portalStringId(group), group]));
  const events = rawEvents.map((event) =>
    normalizePortalEvent(event, {
      groupsById: groupLookup,
      fallbackGroup: event.Linkages?.[0]?.GroupId ? groupLookup[String(event.Linkages[0].GroupId)] : undefined,
    })
  );
  const campuses = rockConvertGroupsToCampuses(rawGroups).map(String);

  return { groups, groupLookup, events, campuses } as const;
}

export function normalizeDashboardSignups(
  rawSignups: RockRegistration[],
  groupLookup: Record<string, PortalConnectGroup>
): PortalSignup[] {
  return rawSignups.map((signup) =>
    normalizePortalSignup(signup, {
      group: signup.GroupId ? groupLookup[String(signup.GroupId)] : undefined,
      groupLookup,
    })
  );
}

export function normalizeDashboardWorkflowSignups(
  rawWorkflows: RockWorkflowSignup[],
  groupLookup: Record<string, PortalConnectGroup>
): PortalSignup[] {
  return rawWorkflows.map((w) =>
    normalizeWorkflowToPortalSignup(w, {
      groupLookup,
    })
  );
}

export function filterNonMemberSignups(signups: PortalSignup[], groups: PortalConnectGroup[]): PortalSignup[] {
  const groupMembersMap = Object.fromEntries(
    groups.map((group) => [
      portalStringId(group),
      new Set((group.provisionalMembers || []).map((member) => portalStringId(member))),
    ])
  );

  return signups.filter(
    (signup) =>
      !groupMembersMap[portalStringId(signup.data.connectGroupId)]?.has(portalStringId(signup.data.contact))
  );
}


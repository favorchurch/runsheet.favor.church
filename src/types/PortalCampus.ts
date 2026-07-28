export interface PortalCampus {
  _id?: string;
  title?: string;
}

export const CAMPUS_TITLES: Record<number, string> = {
  1: 'Favor Church Global',
  2: 'Manila',
  3: 'Brisbane',
  4: 'Seoul',
};

export function getPortalCampuses(campusId?: number | null): PortalCampus[] {
  if (!campusId) return [];
  return [{ _id: String(campusId), title: CAMPUS_TITLES[campusId] || `Campus ${campusId}` }];
}

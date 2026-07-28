import { SectionAccess } from '@/types/AuthUser';

export function foldSectionsByName(sections: SectionAccess[]): SectionAccess[] {
  const grouped = new Map<string, SectionAccess[]>();
  for (const s of sections) {
    const cleanName = s.name.replace(/^(Cluster|Region)\s*\/\/\s*/i, '').trim().toLowerCase().replace(/\s+/g, ' ');
    const key = `${s.campusId || 0}|${cleanName}`;
    const group = grouped.get(key) || [];
    group.push(s);
    grouped.set(key, group);
  }

  const result: SectionAccess[] = [];
  for (const group of grouped.values()) {
    group.sort((a, b) => a.sectionId - b.sectionId);
    result.push(group[0]);
  }
  return result;
}

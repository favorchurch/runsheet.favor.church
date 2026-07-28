import { RockNote } from './RockNote';
import { portalStringId } from './portalStringId';

export interface PortalCareNote extends RockNote {
  _id?: string;
  created?: string;
  updated?: string;
  data: {
    event?: string;
    campus?: string;
    highlights?: string;
    challenges?: string;
    empower?: string;
    questions?: string[];
    milestones?: string[];
    agree?: true;
    [key: string]: unknown;
  };
}

export function normalizePortalCareNote(note: RockNote): PortalCareNote {
  const data: PortalCareNote['data'] = {};
  if (note.Text) {
    try {
      const parsed = JSON.parse(note.Text);
      if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
        Object.assign(data, parsed);
      } else {
        data.highlights = note.Text;
      }
    } catch {
      data.highlights = note.Text;
    }
  }

  return {
    ...note,
    _id: portalStringId(note.Id),
    created: note.CreatedDateTime || undefined,
    updated: note.ModifiedDateTime || note.CreatedDateTime || undefined,
    data,
  };
}

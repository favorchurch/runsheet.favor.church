export interface SheetMusicLink {
  label: string;
  url: string;
}

export interface SongSection {
  title: string;
  content: string;
  isChorus?: boolean;
}

export interface SongDetails {
  id: number;
  title: string;
  cleanTitle: string;
  artist?: string;
  key?: string;
  bpm?: string;
  timeSignature?: string;
  ccli?: string;
  themes?: string;
  rockUrl: string;
  sheetMusicLinks: SheetMusicLink[];
  sections: SongSection[];
  rawContent?: string;
}

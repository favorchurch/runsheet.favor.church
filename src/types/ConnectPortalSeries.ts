export interface ConnectPortalSeries {
  id: number;
  idKey?: string;
  channelId?: number;
  title: string;
  displayTitle: string;
  playlistUrl: string;
  startDateTime?: string | null;
  expireDateTime?: string | null;
  campusIds: number[];
  filterGroupGuid?: string;
  filterToggle: 'show' | 'hide' | 'none';
}

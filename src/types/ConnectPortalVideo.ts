
export interface ConnectPortalVideo {
  // campuses: Realm[];
  _id?: string;
  title?: string;
  data: {
    resourceType: 'Connect Material' | 'Shared Resource';
    tabTitle: string;
  };
  assetType?: 'youtube' | 'vimeo' | 's3' | 'embed' | 'upload' | string;
  external: {
    youtube?: string;
    vimeo?: string;
    embed?: string;
    [key: string]: any;
  };
  width?: number;
  height?: number;
  body?: string;
}

export type ConnectPortalVideoSimple = ConnectPortalVideo;

/**
 *These are PUBLIC environment variables that a client browser can access.

 * DO NOT ADD STORE CREDENTIALS HERE, SUCH AS API TOKENS OR PASSWORDS,
 * even if they're in environment variables.
 *
 */

// toggle to show gender split
export const GENDER_SPLIT = false;

// Rock Public URL for constructing links to the Rock UI.
// Defaults to NEXT_PUBLIC_ROCK_PUBLIC_URL, or derives it from NEXT_PUBLIC_ROCK_API_URL.
export const ROCK_PUBLIC_URL = process.env.NEXT_PUBLIC_ROCK_PUBLIC_URL ||
  (process.env.NEXT_PUBLIC_ROCK_API_URL ? process.env.NEXT_PUBLIC_ROCK_API_URL.replace(/\/api$/, '') : '');


// search bar constants
export const SEARCH_PREFIX_LENGTH = 2;
export const SEARCH_DEBOUNCE_TIME = 400;
export const SEARCH_LIMIT_COUNT = 100; // only show 100 items max

export const UPLOAD_CONNECT_PHOTOS_URL =
  process.env.UPLOAD_CONNECT_PHOTOS_URL || 'https://photos.app.goo.gl/ohquye7Zmgjooo5w5';

export const CampusName = {
  Global: 'Favor Church Global',
  Manila: 'Manila',
  Brisbane: 'Brisbane',
  Seoul: 'Seoul',
} as const;

// List campus names
export const CAMPUS_NAMES = [CampusName.Manila, CampusName.Brisbane, CampusName.Seoul];

// Rock Campus IDs (flat model, replaces Fluro realm hierarchy)
// Campus IDs differ between rock-preview (MNL=2, BNE=3, SEL=4, GLOBAL=1) and rock prod (MNL=1, BNE=2, SEL=3, GLOBAL=4).
const isProdRock = (() => {
  const apiEndpoint =
    (typeof process !== 'undefined'
      ? process.env.NEXT_PUBLIC_ROCK_API_URL || process.env.ROCK_API_URL
      : '') || '';
  if (apiEndpoint) {
    return apiEndpoint.includes('rock.favor.church') && !apiEndpoint.includes('preview');
  }
  if (typeof window !== 'undefined') {
    return window.location.hostname === 'connect.favor.church';
  }
  return false;
})();

export const RockCampusId = isProdRock
  ? ({
      Global: 4,
      Manila: 1,
      Brisbane: 2,
      Seoul: 3,
    } as const)
  : ({
      Global: 1,
      Manila: 2,
      Brisbane: 3,
      Seoul: 4,
    } as const);

export type RockCampusIdType = (typeof RockCampusId)[keyof typeof RockCampusId];
export const ROCK_CAMPUS_IDS = [RockCampusId.Manila, RockCampusId.Brisbane, RockCampusId.Seoul] as const;

// EntityTypeId for Rock.Model.Workflow — verified 113 on rock-preview.
export const ROCK_WORKFLOW_ENTITY_TYPE_ID = Number(process.env.NEXT_PUBLIC_ROCK_WORKFLOW_ENTITY_TYPE_ID || '113');

// WorkflowTypeId for the "Sign up for a Connect Group!" form — verified 39.
export const ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID = Number(process.env.NEXT_PUBLIC_ROCK_CONNECT_SIGNUP_WORKFLOW_TYPE_ID || '39');

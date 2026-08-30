/**
 * Public, browser-safe configuration constants. Never import secrets here —
 * server-only config (e.g. ROCK_API_KEY) lives in `constants/server.ts` instead.
 */

export const APP_URL = process.env.NEXT_PUBLIC_APP_URL || 'https://runsheet.favor.church';

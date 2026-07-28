import { type NextResponse } from 'next/server';
import packageJson from '../../package.json';

export const APP_MAJOR_VERSION_COOKIE = 'favor-connect-major-version';
export const ONE_YEAR_SECONDS = 60 * 60 * 24 * 365;

export function getMajorVersion(version: string): string | null {
  const trimmedVersion = version.trim();
  const match = /^(\d+)(?:\.\d+){0,2}(?:-[0-9A-Za-z-.]+)?(?:\+[0-9A-Za-z-.]+)?$/.exec(trimmedVersion);

  return match?.[1] ?? null;
}

export const CURRENT_APP_MAJOR_VERSION = getMajorVersion(packageJson.version) ?? '0';

export function hasMajorVersionMismatch(
  cookieMajorVersion: string | undefined,
  currentMajorVersion = CURRENT_APP_MAJOR_VERSION
): boolean {
  if (!cookieMajorVersion) return false;

  const parsedCookieMajorVersion = getMajorVersion(cookieMajorVersion);
  if (!parsedCookieMajorVersion) return true;

  return parsedCookieMajorVersion !== currentMajorVersion;
}

export function setCurrentMajorVersionCookie(response: NextResponse): void {
  response.cookies.set(APP_MAJOR_VERSION_COOKIE, CURRENT_APP_MAJOR_VERSION, {
    httpOnly: true,
    maxAge: ONE_YEAR_SECONDS,
    path: '/',
    sameSite: 'lax',
    secure: process.env.NODE_ENV === 'production',
  });
}

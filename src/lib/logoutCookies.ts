import { NextRequest, NextResponse } from 'next/server';

export const CLEAR_ALL_COOKIES_QUERY_PARAM = 'clearAllCookies';

function getCandidatePaths(pathname: string): string[] {
  const parts = pathname.split('/').filter(Boolean);
  const paths = new Set<string>(['/']);

  let currentPath = '';
  for (const part of parts) {
    currentPath += `/${part}`;
    paths.add(currentPath);
  }

  return [...paths];
}

function getCandidateDomains(hostname: string): string[] {
  if (!hostname.includes('.')) return [];

  const parts = hostname.split('.');
  const domains = new Set<string>([hostname]);

  for (let index = 1; index < parts.length - 1; index += 1) {
    domains.add(`.${parts.slice(index).join('.')}`);
  }

  return [...domains];
}

function appendExpiredCookie(response: NextResponse, name: string, path: string, domain?: string): void {
  response.headers.append(
    'Set-Cookie',
    [
      `${name}=`,
      `Path=${path}`,
      'Max-Age=0',
      'Expires=Thu, 01 Jan 1970 00:00:00 GMT',
      'SameSite=Lax',
      ...(domain ? [`Domain=${domain}`] : []),
    ].join('; ')
  );
}

export function shouldClearAllCookies(req: NextRequest): boolean {
  return req.nextUrl.searchParams.get(CLEAR_ALL_COOKIES_QUERY_PARAM) === '1';
}

export function clearRequestCookies(req: NextRequest, response: NextResponse): void {
  const paths = getCandidatePaths(req.nextUrl.pathname);
  const domains = getCandidateDomains(req.nextUrl.hostname);

  for (const cookie of req.cookies.getAll()) {
    for (const path of paths) {
      appendExpiredCookie(response, cookie.name, path);

      for (const domain of domains) {
        appendExpiredCookie(response, cookie.name, path, domain);
      }
    }
  }
}

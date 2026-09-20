import {
  APP_MAJOR_VERSION_COOKIE,
  hasMajorVersionMismatch,
  setCurrentMajorVersionCookie,
} from '@/lib/appVersionCookie';
import { CLEAR_ALL_COOKIES_QUERY_PARAM } from '@/lib/logoutCookies';
import { NextRequest, NextResponse } from 'next/server';

export const config = {
  matcher: ['/((?!_next|api|images|img|icon\\.png|favicon\\.ico|redirect).*)'],
};

function getExpectedUrl(): URL | null {
  return process.env.AUTH0_BASE_URL ? new URL(process.env.AUTH0_BASE_URL) : null;
}

function buildLogoutUrl(req: NextRequest, expectedUrl: URL | null): URL {
  const logoutUrl = new URL('/api/auth/logout', expectedUrl?.origin ?? req.nextUrl.origin);
  logoutUrl.searchParams.set(CLEAR_ALL_COOKIES_QUERY_PARAM, '1');
  logoutUrl.searchParams.set('returnTo', `${req.nextUrl.pathname}${req.nextUrl.search}`);

  return logoutUrl;
}

function maybeRedirectToCanonicalHost(req: NextRequest, expectedUrl: URL | null): NextResponse | null {
  if (!expectedUrl) return null;

  const url = new URL(req.url);
  if (url.origin === expectedUrl.origin) return null;

  return NextResponse.redirect(expectedUrl.origin + url.pathname + url.search, 307);
}

function maybeRedirectFacebookApp(req: NextRequest, expectedUrl: URL | null): NextResponse | null {
  if (!expectedUrl) return null;

  const ua = req.headers.get('user-agent') || '';
  const isFacebookApp = ua.includes('FBAN') && ua.includes('FBAV');
  if (!isFacebookApp) return null;

  const redirectUrl = new URL(expectedUrl.origin + '/redirect');
  redirectUrl.searchParams.set('to', req.nextUrl.href);

  return NextResponse.redirect(redirectUrl, 307);
}

export function middleware(req: NextRequest) {
  // This middleware performs no authentication or authorization; authentication
  // and route access gates are enforced by page components and server actions via
  // requireServerSession() / getRockSession().
  const expectedUrl = getExpectedUrl();

  const canonicalRedirect = maybeRedirectToCanonicalHost(req, expectedUrl);
  if (canonicalRedirect) return canonicalRedirect;

  const facebookRedirect = maybeRedirectFacebookApp(req, expectedUrl);
  if (facebookRedirect) return facebookRedirect;

  const cookieMajorVersion = req.cookies.get(APP_MAJOR_VERSION_COOKIE)?.value;
  if (hasMajorVersionMismatch(cookieMajorVersion)) {
    return NextResponse.redirect(buildLogoutUrl(req, expectedUrl), 307);
  }

  const response = NextResponse.next();
  setCurrentMajorVersionCookie(response);

  return response;
}

import 'server-only';

import { getSession, type Session } from '@auth0/nextjs-auth0';
import { headers } from 'next/headers';
import { redirect } from 'next/navigation';
import { NextRequest, NextResponse } from 'next/server';

function getRequestPath(requestHeaders: Headers): string {
  const pathname = requestHeaders.get('x-invoke-path') || '/';
  const query = requestHeaders.get('x-invoke-query');

  return `${pathname}${query ? `?${query}` : ''}`;
}

function getRequestUrl(requestHeaders: Headers): string {
  const configuredBaseUrl =
    process.env.AUTH0_BASE_URL || process.env.NEXT_PUBLIC_AUTH0_BASE_URL || 'http://localhost';
  const baseUrl = new URL(
    configuredBaseUrl.startsWith('http') ? configuredBaseUrl : `https://${configuredBaseUrl}`
  );

  const protocol = requestHeaders.get('x-forwarded-proto') || baseUrl.protocol.replace(/:$/, '');
  const host = requestHeaders.get('x-forwarded-host') || requestHeaders.get('host') || baseUrl.host;

  return `${protocol}://${host}${getRequestPath(requestHeaders)}`;
}

export async function getServerSession(): Promise<Session | null | undefined> {
  const headerStore = await headers();
  const requestHeaders = new Headers(headerStore);
  const request = new NextRequest(getRequestUrl(requestHeaders), {
    headers: requestHeaders,
  });

  return getSession(request, new NextResponse());
}

export async function requireServerSession(): Promise<Session> {
  const session = await getServerSession();
  if (session?.user) {
    return session;
  }

  const requestPath = getRequestPath(new Headers(await headers()));
  const loginPath = process.env.NEXT_PUBLIC_AUTH0_LOGIN || '/api/auth/login';
  redirect(`${loginPath}?returnTo=${encodeURIComponent(requestPath)}`);
}

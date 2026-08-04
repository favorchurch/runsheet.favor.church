import { getServerSession } from '@/auth0-hooks/server/getServerSession';
import { getSessionUser } from '@/auth0-hooks/server/getSessionUser';
import { Auth0LoginGate } from '@/components/auth/Auth0LoginGate';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';
import { canUserAccessRunsheet } from '@/lib/permissions';
import type { AuthUser } from '@/types/AuthUser';

/*
 * `/api/auth/login` and `/api/auth/logout` are Auth0 route handlers, not pages.
 * They answer with a redirect to Auth0, so the browser has to make the request
 * itself — `next/link` would try to client-side navigate and the login flow
 * would never start. `no-html-link-for-pages` cannot tell the two apart, so it
 * is switched off for this file only.
 */
/* eslint-disable @next/next/no-html-link-for-pages */

export default async function Home() {
  // 1. Enforce Auth0 session check (Unauthenticated users see ONLY the Auth Gate)
  let session = null;
  try {
    session = await getServerSession();
  } catch (err) {
    console.warn('Auth0 session check failed:', err);
  }

  if (!session?.user) {
    return <Auth0LoginGate type="unauthenticated" />;
  }

  // 2. Fetch merged Auth0 + Rock session (with email resolution & volunteer fallback)
  let sessionUser: AuthUser;
  try {
    sessionUser = await getSessionUser();
  } catch {
    const raw = session.user as any;
    sessionUser = {
      ...raw,
      email: raw.email || '',
      contact: {
        id: 0,
        email: raw.email || '',
        fullName: raw.name || raw.nickname || raw.email || 'Volunteer User',
      },
    };
  }

  // 3. Gate users without any roles/permissions
  if (!canUserAccessRunsheet(sessionUser)) {
    return (
      <Auth0LoginGate
        type="ineligible"
        userEmail={sessionUser.email || sessionUser.contact?.email}
        errorMessage="Your account does not have an assigned team role or permission to access runsheets."
      />
    );
  }




  return (
    <main className="flex min-h-screen flex-col items-center px-3 py-0 sm:px-6 bg-slate-50 text-slate-900 w-full">
      <RunsheetManager user={sessionUser} />
    </main>
  );
}

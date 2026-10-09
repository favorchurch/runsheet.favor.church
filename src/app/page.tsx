import { getServerSession } from '@/auth0-hooks/server/getServerSession';
import { getSessionUser } from '@/auth0-hooks/server/getSessionUser';
import { Auth0LoginGate } from '@/components/auth/Auth0LoginGate';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';
import { getAccessGateState } from '@/lib/permissions';
import { logAccessDenial } from '@/lib/accessDiagnostics';
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
    const errorClassName =
      (err && typeof err === 'object' && 'name' in err && typeof err.name === 'string' && err.name) ||
      (err && typeof err === 'object' && err.constructor?.name) ||
      'Error';
    console.warn(`Auth0 session check failed: ${errorClassName}`);
  }

  if (!session?.user) {
    return <Auth0LoginGate type="unauthenticated" />;
  }

  // 2. Fetch merged Auth0 + Rock session (with email resolution & volunteer fallback)
  let sessionUser: AuthUser;
  try {
    sessionUser = await getSessionUser();
  } catch (err) {
    const errorClassName =
      (err && typeof err === 'object' && 'name' in err && typeof err.name === 'string' && err.name) ||
      (err && typeof err === 'object' && err.constructor?.name) ||
      'Error';
    console.warn(`[Home] getSessionUser failed: ${errorClassName}`);
    sessionUser = {
      ...(session.user as any),
      accessResolutionFailed: true,
    };
  }

  // 3. Gate users based on gate decision
  const gateState = getAccessGateState(sessionUser);

  if (gateState !== 'allowed') {
    logAccessDenial(sessionUser, gateState);
    return (
      <Auth0LoginGate
        type={gateState}
        userEmail={sessionUser.email || sessionUser.contact?.email}
        errorMessage={
          gateState === 'ineligible'
            ? 'Your account does not have an assigned team role or permission to access runsheets.'
            : undefined
        }
        title={gateState === 'ineligible' ? 'Access Restricted' : undefined}
      />
    );
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-3 py-0 sm:px-6 bg-slate-50 text-slate-900 w-full">
      <RunsheetManager user={sessionUser} />
    </main>
  );
}

import { requireServerSession } from '@/auth0-hooks/server/getServerSession';
import { resolvePageUser } from '@/components/auth/resolvePageUser';
import { getAccessGateState } from '@/lib/permissions';
import { logAccessDenial } from '@/lib/accessDiagnostics';
import { Auth0LoginGate } from '@/components/auth/Auth0LoginGate';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ channelId: string }>;
}

export default async function DirectRunsheetPage({ params }: PageProps) {
  const { channelId } = await params;
  const parsedChannelId = parseInt(channelId, 10);

  const session = await requireServerSession();
  const sessionUser = await resolvePageUser(session.user);
  const gateState = getAccessGateState(sessionUser);

  // Whether this channel actually exists / is in scope is verified
  // client-side by RunsheetManager's own loadChannelDetails (it falls back
  // to "/" via history.pushState, no hard navigation, on a bad id). Doing
  // that same existence check here with a real redirect() was actively
  // harmful: this route is force-dynamic, so it re-executes on every
  // Server-Action-triggered refresh — including the one that follows every
  // save — and a fresh re-fetch of the channel list racing a just-completed
  // write could transiently omit the current channel, firing a real
  // redirect('/') that wiped all in-progress UI (an open propagate review,
  // unsaved edits) with no warning, looking like "the site refreshed".
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
      <RunsheetManager
        user={sessionUser}
        initialChannelId={isNaN(parsedChannelId) ? null : parsedChannelId}
      />
    </main>
  );
}

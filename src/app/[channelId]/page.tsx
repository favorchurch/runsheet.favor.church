import { requireServerSession } from '@/auth0-hooks/server/getServerSession';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { canUserAccessRunsheet } from '@/lib/permissions';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ channelId: string }>;
}

export default async function DirectRunsheetPage({ params }: PageProps) {
  const { channelId } = await params;
  const parsedChannelId = parseInt(channelId, 10);

  await requireServerSession();
  const session = await getRockSession();
  const canAccess = canUserAccessRunsheet(session);

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
  if (!canAccess) {
    return (
      <div className="mx-auto max-w-xl py-16 text-center">
        <h2 className="text-xl font-bold text-slate-900">Access Restricted</h2>
        <p className="mt-2 text-sm text-slate-600">
          You do not have permission to access the Runsheet manager.
        </p>
      </div>
    );
  }

  const user = {
    sub: String(session.personId),
    name: session.contact.fullName,
    email: session.contact.email,
    contact: session.contact,
    rolesMap: session.rolesMap,
    access: session.access,
  };

  return (
    <main className="flex min-h-screen flex-col items-center px-3 py-0 sm:px-6 bg-slate-50 text-slate-900 w-full">
      <RunsheetManager
        user={user}
        initialChannelId={isNaN(parsedChannelId) ? null : parsedChannelId}
      />
    </main>
  );
}

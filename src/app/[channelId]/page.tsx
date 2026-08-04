import { redirect } from 'next/navigation';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { canUserAccessRunsheet } from '@/lib/permissions';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';
import { rockGetAvailableRunsheetChannels } from '@/server-actions/rockGetAvailableRunsheetChannels';

export const dynamic = 'force-dynamic';

interface PageProps {
  params: Promise<{ channelId: string }>;
}

export default async function DirectRunsheetPage({ params }: PageProps) {
  const { channelId } = await params;
  const parsedChannelId = parseInt(channelId, 10);

  const session = await getRockSession();
  const canAccess = canUserAccessRunsheet(session);

  // A link to a runsheet that doesn't exist, or exists outside this user's
  // campus scope, gets a real server redirect here rather than rendering the
  // page and relying on a client effect to notice and clean it up.
  if (canAccess && !isNaN(parsedChannelId)) {
    const { success, channels } = await rockGetAvailableRunsheetChannels();
    if (!success || !channels.some((c) => c.id === parsedChannelId)) {
      redirect('/');
    }
  }

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

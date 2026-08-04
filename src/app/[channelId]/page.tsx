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

  const session = await getRockSession();
  const canAccess = canUserAccessRunsheet(session);

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

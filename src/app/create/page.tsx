import { redirect } from 'next/navigation';
import { getRockSession } from '@/auth0-hooks/server/getRockSession';
import { canUserAccessRunsheet, canUserEditRunsheet } from '@/lib/permissions';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';

export const dynamic = 'force-dynamic';

export default async function CreateRunsheetPage() {
  const session = await getRockSession();
  const canAccess = canUserAccessRunsheet(session);

  // View-only accounts have no business on this route at all — send them
  // home with a real server redirect rather than rendering `/create` and
  // relying on a client effect to clean it up after the fact.
  if (canAccess && !canUserEditRunsheet(session)) {
    redirect('/');
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

  return <RunsheetManager user={user} initialShowCreate={true} />;
}

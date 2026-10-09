import { redirect } from 'next/navigation';
import { requireServerSession } from '@/auth0-hooks/server/getServerSession';
import { resolvePageUser } from '@/components/auth/resolvePageUser';
import { canUserEditRunsheet, getAccessGateState } from '@/lib/permissions';
import { logAccessDenial } from '@/lib/accessDiagnostics';
import { Auth0LoginGate } from '@/components/auth/Auth0LoginGate';
import { RunsheetManager } from '@/components/runsheet/RunsheetManager';

export const dynamic = 'force-dynamic';

export default async function CreateRunsheetPage() {
  const session = await requireServerSession();
  const sessionUser = await resolvePageUser(session.user);
  const gateState = getAccessGateState(sessionUser);

  // View-only accounts have no business on this route at all — send them
  // home with a real server redirect rather than rendering `/create` and
  // relying on a client effect to clean it up after the fact.
  if (gateState === 'allowed' && !canUserEditRunsheet(sessionUser)) {
    redirect('/');
  }

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

  return <RunsheetManager user={sessionUser} initialShowCreate={true} />;
}

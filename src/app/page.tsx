import { getServerSession } from '@/auth0-hooks/server/getServerSession';
import { RunsheetManager } from '@/components/RunsheetManager';

export default async function Home() {
  let session = null;
  try {
    session = await getServerSession();
  } catch (err) {
    console.warn('Auth0 session check failed:', err);
  }

  return (
    <main className="flex min-h-screen flex-col items-center px-3 py-4 sm:px-6 sm:py-6 bg-slate-50 text-slate-900 w-full">
      <div className="w-full flex flex-col sm:flex-row sm:items-center justify-between gap-4 mb-4">
        <div>
          <h1 className="text-2xl sm:text-3xl font-extrabold tracking-tight text-slate-900">
            Favor Runsheet Studio
          </h1>
          <p className="text-xs sm:text-sm font-medium text-slate-500">
            Spreadsheet-like Runsheet Editor backed by Rock RMS
          </p>
        </div>

        {session?.user ? (
          <div className="flex items-center gap-3 text-xs">
            <span className="font-semibold text-slate-700">
              {session.user.name || session.user.email}
            </span>
            <a
              href="/api/auth/logout"
              className="rounded-lg bg-slate-200 px-3 py-1.5 font-semibold text-slate-800 hover:bg-slate-300"
            >
              Log out
            </a>
          </div>
        ) : (
          <a
            href="/api/auth/login"
            className="rounded-lg bg-blue-600 px-4 py-2 text-xs font-semibold text-white hover:bg-blue-700 w-fit"
          >
            Log in
          </a>
        )}
      </div>

      <RunsheetManager />
    </main>
  );
}

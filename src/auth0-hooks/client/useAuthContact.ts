import 'client-only';

import { AuthContact } from '@/types/AuthUser';
import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect, useState } from 'react';

/**
 * Returns the current user's Rock contact info.
 * Fetches from /api/session (resolved from Rock API on the server).
 */
export function useAuthContact() {
  const { user, error: authError, isLoading: authLoading } = useUser();
  const [contact, setContact] = useState<AuthContact | undefined>();
  const [fetchError, setFetchError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || authLoading) {
      setIsLoading(true);
      setContact(undefined);
      setFetchError(undefined);
      return;
    }

    let cancelled = false;
    setIsLoading(true);
    setFetchError(undefined);

    fetch('/api/session')
      .then((res) => {
        if (!res.ok) throw new Error(`Session fetch failed: ${res.status}`);
        return res.json();
      })
      .then((data) => {
        if (!cancelled) setContact(data.contact);
      })
      .catch((err) => {
        if (!cancelled) setFetchError(err);
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false);
      });

    return () => {
      cancelled = true;
    };
  }, [user, authLoading]);

  return { contact, error: authError || fetchError, isLoading: isLoading || authLoading };
}

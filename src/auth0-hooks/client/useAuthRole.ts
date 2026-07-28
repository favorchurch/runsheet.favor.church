import 'client-only';

import { AuthRolesMap } from '@/types/AuthUser';
import { ConnectRole } from '@/types/ConnectRole';
import { useUser } from '@auth0/nextjs-auth0/client';
import { useEffect, useState } from 'react';

export interface AuthRole {
  isConnectLeader: boolean;
  isRegionalLeader: boolean;
  isClusterHead: boolean;
  isDepartmentHead: boolean;
}

/**
 * Returns flags to check if someone is a connect/regional/cluster leader.
 * Fetches role data from /api/session (resolved from Rock API on the server).
 */
export function useAuthRole(): AuthRole & { isLoading: boolean; error: Error | undefined } {
  const { user, error: authError, isLoading: authLoading } = useUser();
  const [rolesMap, setRolesMap] = useState<AuthRolesMap | undefined>();
  const [fetchError, setFetchError] = useState<Error | undefined>();
  const [isLoading, setIsLoading] = useState(true);

  useEffect(() => {
    if (!user || authLoading) {
      setIsLoading(true);
      setRolesMap(undefined);
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
        if (!cancelled) setRolesMap(data.rolesMap);
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

  return {
    isConnectLeader: !!(rolesMap?.[ConnectRole.ConnectLeader]?.length),
    isRegionalLeader: !!(rolesMap?.[ConnectRole.RegionalLeader]?.length),
    isClusterHead: !!(rolesMap?.[ConnectRole.ClusterHead]?.length),
    isDepartmentHead: !!(rolesMap?.[ConnectRole.DepartmentHead]?.length),
    isLoading: isLoading || authLoading,
    error: authError || fetchError,
  };
}

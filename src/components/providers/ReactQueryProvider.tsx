'use client';

import { QueryClient, QueryClientProvider } from 'react-query';
import { useState } from 'react';
import { Toaster } from 'react-hot-toast';

/**
 * Browser cache policy for weekday edits and high-volume Sunday reads.
 * Details stay reusable for one minute, while inactive data is bounded to ten
 * minutes so a browser cannot grow an unbounded runsheet cache.
 */
export const RUNSHEET_QUERY_STALE_TIME_MS = 60_000;
export const RUNSHEET_QUERY_CACHE_TIME_MS = 10 * 60_000;

export function createRunsheetQueryClient() {
  return new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: RUNSHEET_QUERY_STALE_TIME_MS,
        cacheTime: RUNSHEET_QUERY_CACHE_TIME_MS,
        retry: 1,
        retryDelay: 400,
        refetchOnWindowFocus: false,
        refetchOnReconnect: true,
      },
    },
  });
}

export function ReactQueryProvider({ children }: { children: React.ReactNode }) {
  const [queryClient] = useState(createRunsheetQueryClient);

  return (
    <QueryClientProvider client={queryClient}>
      {children}
      <Toaster
        position="bottom-right"
        toastOptions={{
          duration: 3500,
          style: {
            background: '#0f172a',
            color: '#ffffff',
            fontSize: '13px',
            fontWeight: 500,
            borderRadius: '8px',
            padding: '10px 14px',
            boxShadow: '0 10px 15px -3px rgba(0, 0, 0, 0.1), 0 4px 6px -2px rgba(0, 0, 0, 0.05)',
          },
          success: {
            iconTheme: {
              primary: '#10b981',
              secondary: '#ffffff',
            },
          },
          error: {
            iconTheme: {
              primary: '#ef4444',
              secondary: '#ffffff',
            },
          },
        }}
      />
    </QueryClientProvider>
  );
}

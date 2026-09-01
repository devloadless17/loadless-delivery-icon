'use client';

import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ThemeProvider } from 'next-themes';
import { useState, type ReactNode } from 'react';
import { Toaster } from 'sonner';
import { ApiError } from '@/lib/api-client';
import { UpdatePrompt } from '@/components/update-prompt';

export function Providers({ children }: { children: ReactNode }) {
  const [queryClient] = useState(
    () =>
      new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 30_000, // sockets are the freshness mechanism for live lists
            retry: (failureCount, error) => {
              if (error instanceof ApiError && error.status < 500) return false;
              return failureCount < 2;
            },
            refetchOnWindowFocus: true,
          },
        },
      }),
  );

  // Light by default, not the OS. A vendor's shop screen and a driver's phone
  // are read in daylight far more than in the dark, and a first launch that
  // matches the phone's night mode reads as a different app. The toggle still
  // switches, and the choice is remembered.
  return (
    <ThemeProvider attribute="class" defaultTheme="light" enableSystem={false} disableTransitionOnChange>
      <QueryClientProvider client={queryClient}>
        {children}
        <UpdatePrompt />
        <Toaster
          richColors
          position="top-center"
          // Sonner's action button is 24px tall out of the box. The update
          // prompt's "Refresh" is something a driver taps on a phone, so it
          // gets a real target like every other control in the app.
          toastOptions={{
            actionButtonStyle: {
              height: '2.5rem',
              paddingInline: '0.9rem',
              fontSize: '0.875rem',
              fontWeight: 600,
            },
          }}
        />
      </QueryClientProvider>
    </ThemeProvider>
  );
}

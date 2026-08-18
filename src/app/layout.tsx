import { UserProvider } from '@auth0/nextjs-auth0/client';
import { ReactQueryProvider } from '@/components/providers/ReactQueryProvider';
import './globals.css';

export const metadata = {
  title: 'Favor Runsheet Platform',
  description: 'Favor Church Service Runsheet Application',
  icons: {
    icon: '/favicon.png',
    shortcut: '/favicon.png',
    apple: '/favicon.png',
  },
};


export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body>
        <UserProvider>
          <ReactQueryProvider>{children}</ReactQueryProvider>
        </UserProvider>
      </body>
    </html>
  );
}

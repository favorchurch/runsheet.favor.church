import { UserProvider } from '@auth0/nextjs-auth0/client';
import './globals.css';

export const metadata = {
  title: 'Favor Runsheet',
  description: 'Favor Church Service Runsheet Application',
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
          {children}
        </UserProvider>
      </body>
    </html>
  );
}

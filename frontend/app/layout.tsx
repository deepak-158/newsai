import type { Metadata } from 'next';
import './globals.css';

export const metadata: Metadata = {
  title: 'ET IntelliSphere',
  description: 'AI-native personalized business news intelligence platform',
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <link rel="preconnect" href="https://fonts.googleapis.com" />
        <link rel="preconnect" href="https://fonts.gstatic.com" crossOrigin="anonymous" />
        <link href="https://fonts.googleapis.com/css2?family=Inter:wght@300;400;500;600;700;800;900&display=swap" rel="stylesheet" />
      </head>
      <body className="min-h-screen antialiased transition-colors duration-400">
        {children}
      </body>
    </html>
  );
}

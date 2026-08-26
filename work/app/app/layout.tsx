import type { Metadata } from 'next';
import { GeistMono } from 'geist/font/mono';
import { GeistSans } from 'geist/font/sans';
import './globals.css';

const productionHost = process.env.VERCEL_PROJECT_PRODUCTION_URL;
const metadataBase = new URL(productionHost ? `https://${productionHost}` : 'http://localhost:3000');

export const metadata: Metadata = {
  metadataBase,
  title: 'Control SKU | BAMinds',
  description: 'Control colaborativo de coincidencias de códigos entre sistemas.',
  openGraph: {
    title: 'Control SKU | BAMinds',
    description: 'Coincidencias entre sistemas',
    images: [{ url: '/og.png', width: 1536, height: 1024, alt: 'Control SKU · Coincidencias entre sistemas' }],
  },
  twitter: {
    card: 'summary_large_image',
    title: 'Control SKU | BAMinds',
    description: 'Coincidencias entre sistemas',
    images: ['/og.png'],
  },
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="es" className={`${GeistSans.variable} ${GeistMono.variable}`}><body className={`${GeistSans.className} antialiased`}>{children}</body></html>;
}

import type { Metadata, Viewport } from 'next'
import './globals.css'
import { Providers } from './providers'
import { PWARegister } from '@/components/PWARegister'

export const metadata: Metadata = {
  title: 'Cement House — Management Platform',
  description: 'Construction Materials Distributor Management',
  manifest: '/manifest.json',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
    title: 'Cement House',
  },
}

export const viewport: Viewport = {
  themeColor: '#1e3a5f',
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <head>
        <link rel="icon" href="/icons/icon.svg" type="image/svg+xml" />
        <link rel="apple-touch-icon" href="/icons/icon.svg" />
      </head>
      <body>
        <Providers>{children}</Providers>
        <PWARegister />
      </body>
    </html>
  )
}

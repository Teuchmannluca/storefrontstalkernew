import type { Metadata } from 'next'
import { SyncStatusProvider } from '@/contexts/SyncStatusContext'
import StatusBar from '@/components/StatusBar'
import './globals.css'

export const metadata: Metadata = {
  title: 'Storefront Stalker',
  description: 'Track and monitor Amazon storefronts',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body className="antialiased">
        <SyncStatusProvider>
          {children}
          <StatusBar />
        </SyncStatusProvider>
      </body>
    </html>
  )
}
import type { Metadata } from 'next'
import Image from 'next/image'
import './globals.css'
import AuthGate from '@/components/AuthGate'
import AuthHeaderControls from '@/components/AuthHeaderControls'

export const metadata: Metadata = {
  title: 'Content Intelligence',
  description: 'Product marketing content intelligence for competitor and market analysis',
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <body>
        <div className="min-h-screen flex flex-col">
          <header className="bg-white border-b border-gray-200 px-6 py-4">
            <div className="max-w-7xl mx-auto flex items-center gap-3">
              <a href="/" className="flex items-center gap-2 hover:opacity-80 transition-opacity">
                <Image src="/logo.png" alt="Signal Scout" width={120} height={32} className="h-8 w-auto" priority />
              </a>
              <nav className="ml-6 flex items-center gap-4">
                <a href="/companies" className="text-sm text-gray-600 hover:text-gray-900">Companies</a>
                <a href="/compare" className="text-sm text-gray-600 hover:text-gray-900">Compare</a>
              </nav>
              <AuthHeaderControls />
            </div>
          </header>
          <main className="flex-1 max-w-7xl mx-auto w-full px-6 py-8">
            <AuthGate>{children}</AuthGate>
          </main>
        </div>
      </body>
    </html>
  )
}

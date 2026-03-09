import type { Metadata } from 'next'
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
              <div className="w-7 h-7 bg-brand-500 rounded-md flex items-center justify-center">
                <svg className="w-4 h-4 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor">
                  <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 19v-6a2 2 0 00-2-2H5a2 2 0 00-2 2v6a2 2 0 002 2h2a2 2 0 002-2zm0 0V9a2 2 0 012-2h2a2 2 0 012 2v10m-6 0a2 2 0 002 2h2a2 2 0 002-2m0 0V5a2 2 0 012-2h2a2 2 0 012 2v14a2 2 0 01-2 2h-2a2 2 0 01-2-2z" />
                </svg>
              </div>
              <a href="/" className="text-base font-semibold text-gray-900 hover:text-brand-600">
                Content Intelligence
              </a>
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

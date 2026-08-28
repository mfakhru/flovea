import { HeadContent, Scripts, createRootRoute } from '@tanstack/react-router'
import type { ReactNode } from 'react'
import Nav from '../components/Nav'
import { getCurrentUser } from '../lib/auth'

import appCss from '../styles.css?url'

export const Route = createRootRoute({
  loader: async () => ({ user: await getCurrentUser() }),
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      {
        name: 'viewport',
        content: 'width=device-width, initial-scale=1, viewport-fit=cover',
      },
      { title: 'Flovea' },
      { name: 'description', content: 'Catatan pengeluaran rumah tangga' },
      { name: 'theme-color', content: '#ffffff' },
      // iOS ignores the manifest — these drive "Add to Home Screen" there
      { name: 'apple-mobile-web-app-capable', content: 'yes' },
      { name: 'apple-mobile-web-app-title', content: 'Flovea' },
      { name: 'apple-mobile-web-app-status-bar-style', content: 'default' },
    ],
    links: [
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.ico', sizes: '48x48' },
      { rel: 'icon', href: '/icon-192.png', type: 'image/png', sizes: '192x192' },
      { rel: 'apple-touch-icon', href: '/apple-touch-icon.png', sizes: '180x180' },
      { rel: 'manifest', href: '/manifest.webmanifest' },
    ],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  const { user } = Route.useLoaderData()
  return (
    <html lang="id">
      <head>
        <HeadContent />
      </head>
      <body>
        <Nav user={user} />
        {children}
        <Scripts />
      </body>
    </html>
  )
}

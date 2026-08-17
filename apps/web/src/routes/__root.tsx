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
      { name: 'viewport', content: 'width=device-width, initial-scale=1' },
      { title: 'Flovea' },
    ],
    links: [{ rel: 'stylesheet', href: appCss }],
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

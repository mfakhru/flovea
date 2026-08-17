import { createRouter as createTanStackRouter } from '@tanstack/react-router'
import { routeTree } from './routeTree.gen'

export function getRouter() {
  const router = createTanStackRouter({
    routeTree,
    scrollRestoration: true,
    // 'intent' preload fires a fetch on link hover — fine for high-traffic
    // sites, wasteful for a 2-user app on Cloudflare's free tier. Loading
    // only happens on an actual click now; staleTime avoids re-fetching
    // the same route's data on every back-and-forth navigation within 30s.
    defaultPreload: false,
    defaultStaleTime: 30_000,
  })

  return router
}

declare module '@tanstack/react-router' {
  interface Register {
    router: ReturnType<typeof getRouter>
  }
}

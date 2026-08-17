import { Link, useRouter } from '@tanstack/react-router'
import type { CurrentUser } from '../lib/auth'
import { logout } from '../lib/auth'

export default function Nav({ user }: { user: CurrentUser | null }) {
  const router = useRouter()

  async function handleLogout() {
    await logout()
    await router.navigate({ to: '/login' })
    router.invalidate()
  }

  return (
    <nav className="app-nav">
      <div className="container">
        <Link to={user ? '/expenses' : '/login'} className="brand">
          Flovea
        </Link>
        <div className="links">
          {user ? (
            <>
              <Link to="/expenses">Riwayat</Link>
              <Link to="/expenses/new">Tambah</Link>
              <Link to="/import">Import</Link>
              <span className="muted">{user.display_name}</span>
              <button type="button" className="secondary" onClick={handleLogout}>
                Logout
              </button>
            </>
          ) : (
            <Link to="/login">Login</Link>
          )}
        </div>
      </div>
    </nav>
  )
}

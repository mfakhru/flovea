import { Link, useRouter } from '@tanstack/react-router'
import { useState } from 'react'
import type { CurrentUser } from '../lib/auth'
import { logout } from '../lib/auth'

export default function Nav({ user }: { user: CurrentUser | null }) {
  const router = useRouter()
  const [open, setOpen] = useState(false)

  async function handleLogout() {
    setOpen(false)
    await logout()
    await router.navigate({ to: '/login' })
    router.invalidate()
  }

  return (
    <nav className="app-nav">
      <div className="container nav-row">
        <Link to={user ? '/' : '/login'} className="brand" onClick={() => setOpen(false)}>
          <img className="brand-logo" src="/logo-mark.png" alt="" width={63} height={40} /> Flovea
        </Link>
        {user && (
          <button
            type="button"
            className={`nav-toggle ${open ? 'is-open' : ''}`}
            aria-label={open ? 'Tutup menu' : 'Buka menu'}
            aria-expanded={open}
            onClick={() => setOpen((v) => !v)}
          >
            <span className="nav-toggle-bars">
              <span />
              <span />
              <span />
            </span>
          </button>
        )}
        <div className={`links ${open ? 'links-open' : ''}`}>
          {user ? (
            <>
              {/* exact, or "/" would match every route and stay highlighted */}
              <Link to="/" activeOptions={{ exact: true }} onClick={() => setOpen(false)}>
                Home
              </Link>
              <Link to="/expenses" onClick={() => setOpen(false)}>
                Riwayat
              </Link>
              <Link to="/expenses/new" onClick={() => setOpen(false)}>
                Tambah
              </Link>
              <Link to="/import" onClick={() => setOpen(false)}>
                Import
              </Link>
              <span className="nav-user">{user.display_name}</span>
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

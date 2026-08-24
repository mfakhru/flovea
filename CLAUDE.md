# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## What this is

Flovea is a personal expense tracker for exactly two users ("Suami" / "Istri", i.e. husband/wife) run as a two-app monorepo, both deployed as Cloudflare Workers:

- `apps/api` — FastAPI backend running on a Cloudflare **Python** Worker, backed by D1 (SQLite).
- `apps/web` — TanStack Start (React 19 + TanStack Router, file-based routing) SSR frontend, deployed as a Cloudflare Worker.

The web worker calls the API worker via a Cloudflare **service binding** (`env.API`), not a public HTTP URL — see `apps/web/src/lib/api.ts`. There is no public REST surface for the API beyond that binding plus whatever routes are exposed for local dev.

## Commands

### apps/api (Python / FastAPI / Cloudflare Python Worker)
Run from `apps/api/`:
```
npm run dev      # uv run pywrangler dev   — local dev server
npm run deploy    # uv run pywrangler deploy
```
Dependencies are managed with `uv` (see `pyproject.toml` / `uv.lock`), not pip directly. There is no lint/test command configured in this app.

Apply D1 migrations (files live in `apps/api/migrations/`, plain numbered `.sql` files, applied with wrangler's standard D1 migration tooling):
```
npx wrangler d1 migrations apply flovea-db          # remote
npx wrangler d1 migrations apply flovea-db --local   # local dev DB
```

### apps/web (TanStack Start / React)
Run from `apps/web/`:
```
npm run dev              # vite dev --port 3000
npm run build             # vite build
npm run preview           # build then vite preview
npm run deploy             # build then wrangler deploy
npm run generate-routes   # tsr generate — regenerate routeTree.gen.ts from src/routes
npm run cf-typegen        # wrangler types — regenerate worker-configuration.d.ts
```
There is no lint/test command configured in this app either. TypeScript is strict (`strict`, `noUnusedLocals`, `noUnusedParameters` all on in `tsconfig.json`).

### Deployment
Each app deploys independently via GitHub Actions, triggered only on changes to its own path:
- `.github/workflows/deploy-api.yml` — pushes to `apps/api/**` on `main` → `uv run pywrangler deploy`.
- `.github/workflows/deploy-web.yml` — pushes to `apps/web/**` on `main` → `npm run deploy`.

## Architecture

### API (`apps/api/src`)
- `entry.py` — the Worker entrypoint (`WorkerEntrypoint.fetch`), adapts incoming JS `Request` to ASGI and hands it to the FastAPI `app`.
- `main.py` — FastAPI app, mounts routers from `src/routers/` (`auth`, `categories`, `expenses`, `imports`) plus a `/health` check that round-trips D1.
- `db.py` — thin wrapper around the D1 binding's `prepare/bind/all/run` JS API (`fetch_all`, `fetch_one`, `execute`). D1 results already arrive as native Python dicts (not JsProxy), so **never** call `.to_py()` on them.
- `security.py` — stdlib-only password hashing (PBKDF2-HMAC-SHA256) and JWT-like session token encode/verify (HMAC-SHA256, no external crypto/JWT library). Deliberately avoids bcrypt/PyJWT because Pyodide package compatibility in the Python Worker runtime is still maturing. Session cookie name/lifetime, and the `get_current_user` FastAPI dependency, live here.
- `schemas.py` — all Pydantic request/response models in one file.
- `routers/` — one file per resource, each a plain `APIRouter`. Every authenticated route depends on `security.get_current_user`, which reads `request.scope["env"]` for the D1 binding and JWT secret (there's no ASGI dependency-injection wrapper around `env` — routers pull it off `request.scope["env"]` directly each time).

Business rule baked into both `routers/expenses.py` and web's `lib/auth.ts` (kept in sync manually, not shared code): **reimbursement only flows one way** — only expenses owned by the user named `"Suami"` may be flagged `needs_reimburse`. This is enforced server-side in `create_expense`/`update_expense`.

Data model (`migrations/0001_init.sql` plus later ALTERs in `0004`/`0005`): `users` (exactly 2 rows, seeded manually — no self-registration), `categories` (6 defaults, users can add more), `expenses` (owned by a user, dated, categorized, optionally flagged for reimbursement and tagged with a `pay_period` of form `YYYY-MM` for salary-cycle grouping independent of calendar month). Migration numbering has a gap (`0003` doesn't exist) — this is expected, not a missing file.

CSV import (`routers/imports.py`) expects columns `date, category, detail, amount, notes, user`; unknown categories are auto-created, unknown users cause a per-row error (partial success is allowed — the response reports `inserted` count plus a per-row `errors` list).

### Web (`apps/web/src`)
- File-based routing under `src/routes/` (TanStack Router). `routeTree.gen.ts` is generated — don't hand-edit it; run `npm run generate-routes` (or just `npm run dev`, which regenerates on the fly) after adding/renaming route files.
- `lib/api.ts` — `apiFetch`/`apiJson`, the only way route code should reach the backend. Calls `env.API.fetch(...)` (the service binding) with a synthetic `https://flovea-api.internal` base, forwards the incoming request's `cookie` header, and pipes the API's `Set-Cookie` back onto the SSR response — the API worker is the single source of truth for session state, the web worker never itself signs or reads the token.
- `lib/auth.ts` — `getCurrentUser` (nullable, for optional-auth pages) vs `requireUser` (throws a TanStack `redirect({ to: '/login' })`) — both implemented as `createServerFn`s that call `/me`. Use `requireUser` in a route's `beforeLoad` to gate a page.
- `lib/expenses.ts` — one `createServerFn` per API endpoint, each doing manual `URLSearchParams` construction for GET filters. Follow this pattern (typed input/output, thin server-fn wrapper over `apiJson`) when adding new endpoints rather than calling `apiFetch` directly from route components.
- `lib/format.ts` — shared Indonesian-locale formatting (`formatRupiah` via `Intl.NumberFormat('id-ID', { currency: 'IDR' })`, `formatDate`, `formatPeriod`). Reuse these rather than re-implementing currency/date formatting.
- UI copy and user-facing strings are in Indonesian (`lang="id"` on `<html>`); keep new UI text consistent with that.
- Styling is a single global `src/styles.css` (Tailwind was scaffolded by create-tanstack-app but is not actually used for the app's own UI classes — components use plain hand-rolled class names like `stat-card`, `bar-row`, `dashboard-grid`).

### Cross-app contracts to keep in sync manually
There's no shared types package between `apps/api` and `apps/web` — Pydantic schemas and TypeScript types are hand-duplicated (e.g. `Expense` in `web/src/lib/expenses.ts` mirrors `ExpenseOut` in `api/src/schemas.py`). When changing an API response shape or adding a field, update both sides, and check `pay_period`/`needs_reimburse` business logic isn't duplicated incorrectly (currently duplicated in `api/src/routers/expenses.py` and `web/src/lib/auth.ts`'s `SUAMI_DISPLAY_NAME` constant).

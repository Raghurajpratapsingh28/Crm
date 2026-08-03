# Authentication

Supabase owns credentials. This app never stores a password.

```text
Browser
  → Supabase signUp / signIn / resetPasswordForEmail
  → access_token (JWT)
  → Next.js sends Authorization: Bearer <access_token>
  → Express verifies the JWT (HS256 secret or JWKS)
  → upsert local users row (id = auth.users.id)
  → attach req.auth
  → load organization_members
  → attach req.tenant
  → protected route
```

## Local setup

1. Create a Supabase project.
2. Copy `.env.example` to `.env`.
3. Set:

```env
NEXT_PUBLIC_SUPABASE_URL=
NEXT_PUBLIC_SUPABASE_ANON_KEY=
SUPABASE_URL=
SUPABASE_JWT_SECRET=
SUPABASE_SERVICE_ROLE_KEY=
```

`SUPABASE_SERVICE_ROLE_KEY` is server-only. Never prefix it with `NEXT_PUBLIC_`.

4. In Supabase Auth, enable email/password. Confirm email redirect URLs:

```text
http://localhost:3000/auth/callback
http://localhost:3000/reset-password
```

5. Run the stack:

```bash
pnpm install
pnpm db:migrate:deploy
pnpm dev
```

## Frontend routes

| Path | Purpose |
|---|---|
| `/signup` | Full name, email, password → Supabase |
| `/login` | Email, password → Supabase |
| `/forgot-password` | `resetPasswordForEmail` |
| `/reset-password` | Recovery session → `updateUser({ password })` |
| `/auth/callback` | Exchange auth code for a cookie session |
| `/onboarding` | Create organization (authenticated, no membership) |
| `/dashboard` | Authenticated + membership |

## API

| Method | Path | Auth |
|---|---|---|
| `GET` | `/api/v1/auth/me` | JWT |
| `POST` | `/api/v1/organizations` | JWT |
| `GET` | `/api/v1/organizations/current` | JWT + active membership |
| `PATCH` | `/api/v1/organizations/current` | JWT + ADMIN |

The client never supplies `user_id`, `role`, or `organization_id` for tenancy. Those come from the verified JWT and `organization_members`.

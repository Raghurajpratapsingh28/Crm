# PRD Roadmap — Company CRM

This document is a detailed working guide for turning the CRM concept notes into a complete, engineering-ready **Product Requirements Document (PRD)**. Every section below maps to a section of the eventual `PRD.md`. Where the concept doc already gives usable content it's marked **✅ drafted** and expanded; where nothing exists yet it's marked **⬜ to define**, with the specific questions that need answers and a template to fill in.

## Decided stack

| Layer | Choice |
|---|---|
| Frontend | Next.js |
| API | TypeScript + Express |
| ORM / database | Prisma + PostgreSQL |
| Auth | Supabase Auth (JWT verified by the API) |
| Background work | Go worker |
| Payments | Razorpay **and** Stripe |
| Packaging & deploy | Docker + Kubernetes |

Passwords are not stored in this app. Supabase owns sign-up, sign-in, session refresh, and password reset. The Express API only verifies the Supabase JWT and scopes every query by `organization_id`. Billing can collect in India (Razorpay) and internationally (Stripe); both providers write into the same subscription/invoice model.

This repo is a **pnpm + Turborepo monorepo**. Runtime design (request path, jobs, payments, Kubernetes) lives in [ARCHITECTURE.md](../ARCHITECTURE.md). Development commands are in the root [README.md](../README.md).

```
apps/web        Next.js UI
apps/api        Express + Prisma
apps/worker     Go job consumer
packages/types  Shared TypeScript contracts
deploy/         Docker Compose + Kubernetes
```

```bash
cp .env.example .env
docker compose -f deploy/docker-compose.yml up postgres
pnpm install
pnpm db:push
pnpm dev                 # web :3000, api :4000, worker poller
```

---

## 1. Overview & Goals

### ⬜ Problem statement
Answer these before writing anything else — they shape every downstream decision:
- Who is the buyer (sales manager? founder? ops lead?) vs. the daily user (sales rep)? These often have different pain points.
- What are they using today — spreadsheets, a bloated enterprise CRM (Salesforce/HubSpot), nothing at all?
- What specifically is broken about that today: cost, complexity, slow UX, poor mobile experience, lack of customization?
- What is the cost of the problem — deals falling through the cracks, no visibility into pipeline, manual reporting overhead?

### ⬜ Target customer
- Company size band (e.g., 5–50 employees, 3–15 person sales team)
- Industry focus (horizontal vs. vertical-specific, e.g., agencies, SaaS, real estate)
- Technical sophistication of the buyer (self-serve vs. needs onboarding/sales-assisted)

### ✅ drafted — Positioning
> "The lightweight CRM for growing teams."

- ⬜ Expand into a full positioning statement: *For [target customer], who [problem], [product name] is a [category] that [key benefit], unlike [main alternative], we [key differentiator].*

### ⬜ Success metrics
Define both product-health and business metrics:
- **Activation:** % of new orgs that create ≥1 contact, ≥1 deal, and invite ≥1 teammate within 7 days
- **Engagement:** weekly active users per org, deals updated per rep per week
- **Retention:** org-level 30/60/90-day retention, seat-level churn
- **Business outcome proxy:** win rate uplift, average deal cycle time reduction (self-reported or measurable if migrating from another tool)
- **North star candidate:** deals moved to "Won" per active org per month

### ⬜ Non-goals
Explicitly state what this product is *not* trying to be (e.g., not a marketing automation platform, not an ERP, not a call-center dialer) — this prevents scope creep later and should mirror Section 9.

---

## 2. User Personas

⬜ Not yet defined in the concept doc — this is a gap. At minimum draft:

| Persona | Role | Primary goals | Frustrations with current tools |
|---|---|---|---|
| Admin/Owner | Sets up org, manages billing, sees everything | Visibility, control, low overhead | Tools too complex or too expensive to configure |
| Sales Manager | Manages a team of reps | Pipeline visibility, forecasting, coaching reps | Can't see team activity without nagging reps |
| Sales Representative | Works leads and deals daily | Fast data entry, clear next actions, don't lose track of follow-ups | Data entry is tedious, tools are slow |
| (Optional) Marketing | Feeds leads into the pipeline | Attribution, lead quality visibility | No visibility once a lead is handed to sales |

For each persona, write a short day-in-the-life scenario — this becomes the source of user stories in Section 5.

---

## 3. Core Concept & Lifecycle

### ✅ drafted — Deal/lead lifecycle
```
Lead → Contacted → Qualified → Meeting → Proposal → Negotiation → Won/Lost → Customer
```

### ⬜ To define per stage
For **each** stage above, specify:
- **Entry criteria** — what makes a record enter this stage (manual move, form fill, automation rule)
- **Required fields** — can a rep move a deal to "Proposal" without an amount and expected close date? (Recommend: yes for MVP, enforce later)
- **Exit paths** — can a deal skip stages (Lead → Won directly)? Recommend allowing skips but logging it in the activity timeline.
- **SLA/staleness rules** — how long can a deal sit in a stage before it's flagged (e.g., "Negotiation" for 30+ days → flagged stale)?

### ⬜ Lost-deal handling
- Reason codes (price, timing, competitor, no budget, ghosted, other — with free text)
- Does a "Lost" deal automatically create a re-engagement task (e.g., follow up in 90 days)?
- Can a "Lost" deal be reopened, or must a new deal be created?

### ⬜ Won-deal → Customer conversion
- What actually happens on "Won"? Does the associated Company/Contact get tagged as "Customer"? Does this trigger a handoff task (e.g., "assign customer success owner")?

---

## 4. Data Model

### ✅ drafted — Entity list
```
users, organizations, organization_members,
companies, contacts,
leads, deals, deal_stages,
activities, tasks,
pipelines, pipeline_stages,
notifications
```

### ✅ drafted — Multi-tenancy rule
Every business object carries `organization_id`.

### ⬜ Full field-level schema

This is the single biggest gap — the concept doc only lists example fields per object informally. Build a real schema table per entity. Template applied below:

#### `organizations`
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | PK |
| name | string | ✓ | |
| plan | enum | ✓ | free / paid tiers, if applicable |
| created_at | timestamp | ✓ | |

#### `users`
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | PK — may match Supabase `auth.users.id` |
| email | string | ✓ | unique globally or per-org? decide |
| supabase_user_id | uuid | ✓ | FK to Supabase Auth; no local `password_hash` |
| full_name | string | ✓ | |
| avatar_url | string | | |
| created_at | timestamp | ✓ | |

#### `organization_members`
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | PK |
| organization_id | uuid | ✓ | FK |
| user_id | uuid | ✓ | FK |
| role | enum | ✓ | `ADMIN` / `MANAGER` / `MEMBER` |
| department | string | | Sales / Marketing / Management — free text or enum? |
| invited_by | uuid | | FK → users |
| status | enum | ✓ | invited / active / deactivated |

#### `contacts`
✅ drafted fields from concept doc: Name, Email, Phone, Job title, Company, Industry, Source, Owner, Tags, Notes.
⬜ Formalize:
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | |
| organization_id | uuid | ✓ | |
| first_name / last_name | string | ✓ | or single `full_name`? decide |
| email | string | | validate format; uniqueness scope? |
| phone | string | | format/country code handling |
| job_title | string | | |
| company_id | uuid | | FK → companies, nullable if no company |
| industry | string | | free text or controlled list? |
| source | enum | | Referral / Website / Cold Outreach / Event / Other |
| owner_id | uuid | ✓ | FK → users |
| tags | array\<string\> | | |
| notes | text | | or should this live only in `activities`? decide — avoid duplicate note systems |
| created_at / updated_at | timestamp | ✓ | |

#### `companies`
✅ drafted fields: Industry, Employees, Website; nested contacts/deals/activities (these are relations, not fields).
⬜ Formalize:
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | |
| organization_id | uuid | ✓ | |
| name | string | ✓ | |
| industry | string | | |
| employee_count | integer | | or a bucketed enum (1-10, 11-50, ...) |
| website | string | | |
| owner_id | uuid | | is a company owned separately from its contacts? decide |
| tags | array\<string\> | | |

#### `leads` vs `deals`
⬜ **Unresolved modeling question:** the concept doc's pipeline (`Lead → Contacted → ... → Won`) suggests leads and deals might be the *same* underlying record moving through stages, OR leads convert into a separate `deals` record once qualified (common in Salesforce-style CRMs). This decision affects the whole schema and UI. Recommend for MVP: **one unified pipeline object** (call it `deals`, where "Lead" is just the first stage) rather than a separate lead-conversion step — it's simpler and matches the concept doc's single funnel diagram. Document whichever choice is made and why.

#### `deals`
✅ drafted fields: Company, Owner, Stage, Expected close, Probability, Amount (implied by dollar figures throughout mockups).
⬜ Formalize:
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | |
| organization_id | uuid | ✓ | |
| name | string | ✓ | e.g. "Acme Enterprise" |
| company_id | uuid | | FK |
| primary_contact_id | uuid | | FK → contacts |
| amount | decimal | | currency handling — single currency for v1? |
| stage | enum/FK | ✓ | FK → pipeline_stages |
| owner_id | uuid | ✓ | FK → users |
| expected_close_date | date | | |
| probability | integer (0-100) | | auto-derived from stage, or manually set? decide |
| lost_reason | enum | | nullable, set only when stage = Lost |
| created_at / updated_at | timestamp | ✓ | |

#### `pipelines` / `pipeline_stages`
⬜ Decide: is there one global pipeline per org for v1, or can orgs define multiple pipelines (e.g., "New Business" vs. "Renewals")? **Recommend single pipeline for v1** — multiple pipelines add real complexity to reporting and UI.
| Field (pipeline_stages) | Type | Notes |
|---|---|---|
| id | uuid | |
| pipeline_id | uuid | FK |
| name | string | Lead, Contacted, Qualified, Meeting, Proposal, Negotiation, Won, Lost |
| order | integer | for drag-and-drop ordering |
| is_won / is_lost | boolean | marks terminal stages |

#### `activities`
✅ drafted types: Call, Email, Meeting, Note, Task, Status Change.
⬜ Formalize:
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | |
| organization_id | uuid | ✓ | |
| type | enum | ✓ | call / email / meeting / note / status_change |
| related_to_type | enum | ✓ | contact / company / deal |
| related_to_id | uuid | ✓ | polymorphic FK |
| author_id | uuid | ✓ | FK → users |
| content | text | | |
| occurred_at | timestamp | ✓ | |
| metadata | jsonb | | e.g. old_stage/new_stage for status_change type |

#### `tasks`
✅ drafted concept: personal task list with due dates.
⬜ Formalize:
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | |
| organization_id | uuid | ✓ | |
| title | string | ✓ | |
| assignee_id | uuid | ✓ | FK → users |
| related_to_type/id | polymorphic | | optional link to a deal/contact/company |
| due_date | date | | |
| status | enum | ✓ | open / done |
| created_by | uuid | | FK → users, for "Task assigned by Rahul" notifications |

#### `notifications`
✅ drafted examples: new lead assigned, deal moved to negotiation, follow-up overdue, proposal accepted, task assigned.
⬜ Formalize:
| Field | Type | Required | Notes |
|---|---|---|---|
| id | uuid | ✓ | |
| user_id | uuid | ✓ | recipient |
| type | enum | ✓ | matches trigger list above |
| payload | jsonb | | deal_id, contact_id, etc. |
| read_at | timestamp | | nullable |
| created_at | timestamp | ✓ | |

### ⬜ Entity-relationship diagram
Once fields are finalized, produce an ERD (can be a Mermaid diagram) showing cardinality: Organization 1—\* Users, Company 1—\* Contacts, Company 1—\* Deals, Deal 1—\* Activities, Deal \*—1 Pipeline Stage, etc.

---

## 5. Feature Specs

For **every** feature, the PRD needs four things: **user story → detailed UI behavior → edge cases → acceptance criteria**. Below is that treatment applied to each feature named in the concept doc. Use this as the template for the ones still marked ⬜.

### 5.1 Dashboard
✅ drafted (mockup): Revenue, Open Deals, Leads, Win Rate cards; pipeline funnel by stage; follow-ups list; recent activity feed.

- **User story:** As a sales manager, I want a single-screen view of pipeline health so I can spot problems without opening every deal.
- ⬜ **UI behavior to define:**
  - Are the four top metrics org-wide, or filterable by "my deals only" vs "team"?
  - What time range do "Revenue" and "Win Rate" cover — this month? trailing 30 days? all-time? Needs a date filter.
  - Does clicking a pipeline-stage bar filter into a deal list for that stage?
- ⬜ **Edge cases:** empty state (new org with zero deals), org with only 1 rep (is "team" view hidden?).
- ⬜ **Acceptance criteria (example):**
  - [ ] Given an org with ≥1 deal, the dashboard loads all four metric cards within 1s.
  - [ ] Given a new org with no data, the dashboard shows an empty state with a CTA to create the first lead.

### 5.2 Contacts
✅ drafted fields (see Section 4).

- **User story:** As a rep, I want to search and filter contacts so I can quickly find who I need to follow up with.
- ⬜ **UI behavior:** list view with search/filter by owner, tag, industry, source; detail view showing linked company, deals, and activity timeline.
- ⬜ **Edge cases:** duplicate contact detection (same email) — warn or block on create? Contact with no company assigned — allowed?
- ⬜ **Acceptance criteria:**
  - [ ] Creating a contact with an email that already exists in the org shows a duplicate warning before saving.
  - [ ] A contact detail page shows all linked deals and the 10 most recent activities by default.

### 5.3 Companies
✅ drafted fields + nested contacts/deals/activities.

- **User story:** As a rep, I want to see everything tied to a company in one place before a call.
- ⬜ **Edge cases:** deleting a company with active deals/contacts — cascade, block, or orphan?
- ⬜ **Acceptance criteria:**
  - [ ] Company detail page lists all associated contacts, open deals (with total value), and a merged activity timeline.

### 5.4 Deals & Pipeline
✅ drafted: kanban-style pipeline view with per-stage dollar totals; deal detail with stage/owner/close date/probability.

- **User story:** As a rep, I want to drag a deal between stages so the pipeline reflects reality without extra clicks.
- ⬜ **UI behavior:** drag-and-drop between stage columns; does dropping into "Won"/"Lost" require a confirmation modal (amount confirmation, lost reason)?
- ⬜ **Edge cases:** what happens to probability when a deal is dragged backward (e.g., Negotiation → Qualified)? Does it auto-recalculate or stay manual?
- ⬜ **Acceptance criteria:**
  - [ ] Dragging a deal into "Lost" requires selecting a lost reason before the move is saved.
  - [ ] Pipeline view stage totals update in real time as deals move.

### 5.5 Team Management
✅ drafted org chart: Sales (reps), Marketing, Management.

- ⬜ **User story, UI, edge cases, acceptance criteria** — not yet defined. At minimum needs: invite flow (email invite → accept via Supabase Auth), deactivation flow (what happens to a deactivated user's open deals — reassign required?), department as free text vs. fixed list.

### 5.6 RBAC
See Section 6 — expanded separately since it cuts across every feature.

### 5.7 Activities
✅ drafted types and example timeline UI.

- ⬜ **UI behavior:** is logging a call/email manual only for v1, or is there email/calendar sync? (Recommend: manual-only for MVP, per Section 9's "no email client" scope.)
- ⬜ **Acceptance criteria:**
  - [ ] Every stage change automatically creates a `status_change` activity with old/new stage.
  - [ ] Activities are sorted newest-first and grouped by day in the UI (per the "Today / Yesterday" grouping shown in the concept doc).

### 5.8 Tasks & Follow-ups
✅ drafted: personal task list with due dates.

- ⬜ **UI behavior:** are overdue tasks visually distinct (red)? Do tasks auto-generate from stage staleness rules (Section 3)?
- ⬜ **Acceptance criteria:**
  - [ ] A task past its due date is flagged overdue and triggers a notification (per Section 5.9).

### 5.9 Notifications
✅ drafted trigger list: new lead assigned, deal moved to negotiation, follow-up overdue, proposal accepted, task assigned by [user].

- ⬜ **UI behavior:** bell icon with unread count (shown in dashboard mockup); mark-as-read behavior; do notifications deep-link to the relevant record?
- ⬜ **Acceptance criteria:**
  - [ ] Assigning a lead to a user creates an in-app notification for that user within 1s.
  - [ ] Notification bell shows an accurate unread count and clears on open.

### 5.10 Analytics
✅ drafted: Revenue, Deals Won/Lost, Pipeline value, Win Rate; per-rep leaderboard (deals + revenue).

- ⬜ **UI behavior:** date range selector; export to CSV? Is this restricted to MANAGER/ADMIN roles (see Section 6)?
- ⬜ **Acceptance criteria:**
  - [ ] Win rate = Won ÷ (Won + Lost) over the selected date range, excluding still-open deals.
  - [ ] Per-rep table is only visible to users with `MANAGER` or `ADMIN` role.

### 5.11 Global Search & Keyboard Shortcuts
✅ drafted: `/` for global search, `N`/`N+C`/`N+D` shortcuts; search results grouped by type (company/contact/deals/activities).

- ⬜ **Acceptance criteria:**
  - [ ] `/` focuses global search from anywhere in the app.
  - [ ] Search returns results across contacts, companies, and deals, ranked by name match then recency.

---

## 6. RBAC Detail

### ✅ drafted — Example matrix (from concept doc, needs finalizing per role below)

| Permission | ADMIN | MANAGER | MEMBER |
|---|---|---|---|
| View own leads/deals | ✓ | ✓ | ✓ |
| View team's leads/deals | ✓ | ✓ | ⬜ decide |
| Assign leads to others | ✓ | ✓ | ✗ |
| View analytics (own) | ✓ | ✓ | ⬜ decide |
| View analytics (team-wide) | ✓ | ✓ | ✗ |
| Manage pipeline stages | ✓ | ⬜ decide | ✗ |
| Manage users/invites | ✓ | ✗ | ✗ |
| Billing | ✓ | ✗ | ✗ |
| Delete records | ⬜ decide | ⬜ decide | ⬜ decide |

- ⬜ Resolve every "decide" cell above before this table goes in the PRD.
- ⬜ Decide enforcement layer: is this checked only in the UI, or enforced at the API level too? (**Must be API-level** — UI-only checks are not real security.)
- ⬜ Decide on object-level ownership overrides — e.g., can a MEMBER always see a deal they're the owner of, regardless of team visibility settings?

---

## 7. Non-Functional Requirements

⬜ Entirely undefined in the concept doc — draft targets for each:

- **Performance:** dashboard and list views load in <1s at p95 for orgs up to [X] records; pipeline drag-and-drop reflects in <200ms.
- **Availability:** target uptime (e.g., 99.5% for MVP, no formal SLA yet).
- **Data isolation:** every query must be scoped by `organization_id` — define this as a hard architectural rule enforced in middleware, not per-query discipline.
- **Backup/recovery:** daily automated backups, defined RPO/RTO even if informal at MVP stage.
- **Security:** Supabase Auth for credentials and session expiry; Express verifies the Supabase JWT on every request; rate limiting on auth-adjacent and payment webhooks; audit log for permission-sensitive actions (user role changes, deletions, billing changes).
- **Scalability assumption:** rough target for MVP — e.g., support up to 50 orgs, 20 users/org, 10k deals/org — so the schema/indexing choices aren't wasted work but also aren't premature optimization.

---

## 8. Technical Architecture

### ✅ drafted — MVP stack
```
Next.js  →  Express (TypeScript)  →  Prisma  →  PostgreSQL
                 │
                 ├── Supabase Auth (JWT)
                 ├── Razorpay + Stripe (payments)
                 └── Go worker (async jobs)
```
Local and production both run as Docker images. Production is scheduled on Kubernetes.

### ✅ drafted — Long-term stack
```
Next.js → Ingress → Express API → Prisma → PostgreSQL
                         │
                         ├── Supabase Auth
                         ├── Razorpay / Stripe webhooks
                         └── queue → Go workers → email, notifications, analytics rollups, payment reconciliation
```

### ✅ drafted — Auth (Supabase)
- Next.js talks to Supabase for sign-up, sign-in, password reset, and (later) social SSO.
- The browser sends the Supabase access token to Express (`Authorization: Bearer <jwt>`).
- Express middleware verifies the JWT against the Supabase project JWKS / JWT secret, then loads the local `users` + `organization_members` row.
- Tenant middleware attaches `organization_id` and refuses any query that is not scoped to it.
- App user records are created on first verified token (or via invite accept). No password hashes live in PostgreSQL.

### ✅ drafted — Payments (Razorpay + Stripe)
Both processors are first-class. A single `payments` module chooses the provider from org country / currency / admin preference:

| Provider | Typical use |
|---|---|
| Razorpay | INR and India-local methods (UPI, cards, netbanking) |
| Stripe | International cards and non-INR checkout |

Shared rules:
- Subscriptions, invoices, and webhook events are stored in PostgreSQL (Prisma), not only in the provider dashboard.
- Each org has at most one active provider subscription at a time; switching providers is an explicit admin action.
- Webhooks hit Express (`POST /webhooks/razorpay`, `POST /webhooks/stripe`), are signature-verified, then enqueued to the Go worker for reconciliation (mark paid, extend plan, send receipt, notify admin).
- Billing UI and API stay ADMIN-only (see Section 6).

### ✅ drafted — Go worker
The API stays request/response. Long-running or retryable work runs in Go:

- Email (invites, receipts, overdue follow-ups)
- In-app / push notification fan-out
- Payment webhook reconciliation and dunning
- Analytics rollups, stale-deal flags, scheduled task reminders

The worker reads jobs from a queue (Postgres-backed for MVP is acceptable; Redis later if volume needs it), is idempotent on `job_id`, and is deployed as its own Docker image / Kubernetes Deployment.

### ✅ drafted — Monorepo layout
```
apps/
├── web/                   # Next.js
├── api/                   # TypeScript + Express + Prisma
└── worker/                # Go
packages/
├── types/                 # Shared TS contracts (@crm/types)
└── tsconfig/
deploy/
├── docker-compose.yml
└── k8s/

apps/api/
├── src/
│   ├── modules/
│   │   ├── auth/          # Supabase JWT verify + user upsert
│   │   ├── organizations/
│   │   ├── users/
│   │   ├── companies/
│   │   ├── contacts/
│   │   ├── leads/
│   │   ├── deals/
│   │   ├── pipelines/
│   │   ├── activities/
│   │   ├── tasks/
│   │   ├── notifications/
│   │   ├── analytics/
│   │   └── payments/      # Razorpay + Stripe checkout, portal, webhooks
│   ├── middleware/
│   │   ├── auth.ts
│   │   ├── tenant.ts
│   │   └── permissions.ts
│   ├── lib/
│   │   ├── prisma.ts
│   │   ├── supabase.ts
│   │   ├── razorpay.ts
│   │   └── stripe.ts
│   └── server.ts
├── prisma/
│   ├── schema.prisma
│   └── migrations/
└── Dockerfile

apps/worker/               # Go
├── cmd/worker/main.go
├── internal/
│   ├── jobs/
│   ├── notifications/
│   ├── payments/
│   └── email/
└── Dockerfile

apps/web/                  # Next.js
└── ...

deploy/
├── docker-compose.yml     # local: api, worker, postgres, (optional redis)
└── k8s/
    ├── namespace.yaml
    ├── api-deployment.yaml
    ├── worker-deployment.yaml
    ├── postgres.yaml      # or managed Cloud SQL / RDS / Supabase Postgres
    ├── ingress.yaml
    └── secrets.yaml
```

### ✅ drafted — Frontend route layout
```
app/
├── dashboard/
├── leads/
├── contacts/
├── companies/
├── deals/
├── pipeline/
├── tasks/
├── activities/
├── analytics/
├── team/
├── settings/
└── billing/               # ADMIN: plan, invoices, Razorpay or Stripe checkout
```

### ✅ drafted — Docker & Kubernetes
- Each of `apps/web`, `apps/api`, and `apps/worker` has its own Dockerfile.
- `docker-compose.yml` is the local path: Next.js, Express, Go worker, PostgreSQL, Prisma migrate on api boot.
- Kubernetes Deployments for api, web, and worker; a Service + Ingress in front of web and api; Secrets for `DATABASE_URL`, Supabase keys, Razorpay keys, Stripe keys.
- Prisma migrations run as a Kubernetes Job / init container before new api replicas take traffic.
- Postgres may be in-cluster for staging and a managed instance in production. Supabase is used for Auth; the app database can be the same Supabase Postgres or a separate PostgreSQL — decide before first migrate.

### ⬜ To define
- **API contract:** REST (default with Express). List every endpoint per module (e.g., `GET /deals`, `PATCH /deals/:id/stage`, `POST /contacts`, `POST /billing/checkout`) with request/response shapes.
- **Supabase extras:** is Google/Microsoft SSO in scope for MVP or later? Invite emails via Supabase vs. the Go worker?
- **Payment details:** which plans map to which Razorpay/Stripe price IDs; what happens on failed renewal; tax/GST invoices.
- **Real-time updates:** does the pipeline board need live updates when a teammate moves a deal (websockets/polling), or is refresh-on-load acceptable for v1? (Recommend: polling or refresh-on-focus for MVP, defer websockets.)
- **File storage:** avatars, attachments on deals/activities — needed for v1? If so, what storage (S3-compatible) and size limits?
- **Postgres hosting:** Supabase Postgres vs. a separate managed PostgreSQL used only by Prisma.

---

## 9. MVP Scope (v0.1)

### ✅ drafted — In scope
Authentication (Supabase), Organization, Team members, Contacts, Companies, Leads, Deals, Pipeline, Tasks, Activities, Dashboard, RBAC, billing checkout via Razorpay **or** Stripe, Docker Compose for local, Kubernetes manifests for deploy.

### ✅ drafted — Explicitly out of scope
Email client, Calling system, Marketing automation, AI assistant, WhatsApp integration, Advanced reporting, Custom workflow engine, 100+ integrations. Provider-specific invoicing UIs stay in Razorpay/Stripe; this app stores subscription status and shows a billing page.

### ⬜ To define — Release checklist
Turn the in-scope list into a trackable checklist with rough sizing:

| Feature | Est. effort | Depends on | Owner |
|---|---|---|---|
| Auth (Supabase) + Org creation | ⬜ | — | ⬜ |
| Team invites + RBAC roles | ⬜ | Auth | ⬜ |
| Contacts CRUD | ⬜ | Auth, Org | ⬜ |
| Companies CRUD | ⬜ | Auth, Org | ⬜ |
| Deals + Pipeline (kanban) | ⬜ | Contacts, Companies | ⬜ |
| Tasks | ⬜ | Auth | ⬜ |
| Activities/timeline | ⬜ | Contacts, Companies, Deals | ⬜ |
| Dashboard | ⬜ | Deals, Activities | ⬜ |
| Notifications (in-app) | ⬜ | Tasks, Deals, Go worker | ⬜ |
| Billing (Razorpay + Stripe) | ⬜ | Auth, Org, Go worker | ⬜ |
| Docker Compose + K8s manifests | ⬜ | API, worker, web | ⬜ |

- ⬜ Define a launch definition of done: what must be true (test coverage, no P0 bugs, basic onboarding flow works) before v0.1 ships to a real user.

---

## 10. Differentiation & Future Direction

### ✅ drafted
- Positioning: lightweight CRM for growing teams
- Keyboard-first UX: `N` new lead, `N+C` new contact, `N+D` new deal, `/` global search
- Long-term product map: Sales / Customers / Team → Analytics → Automation (Email, Slack, Webhooks)
- Eventual AI layer idea: "Show everything related to Acme" — natural-language cross-entity query, explicitly positioned as **post-MVP**, after the core CRM works.

### ⬜ To define
- Prioritize which differentiators are cheap enough to include in v1 (keyboard shortcuts, global search) vs. which are genuinely v2+ (automation, AI layer, Slack/webhooks integration).
- Competitive analysis: 2–3 direct alternatives (e.g., Pipedrive, HubSpot Free, a plain spreadsheet) and where this product is meant to win — likely speed/simplicity, not feature count.

---

## 11. Open Questions & Risks

⬜ None of these are resolved in the concept doc — track them explicitly so they don't get silently decided by whoever writes the code first:

- **Pricing/packaging:** per-seat, per-org flat fee, or freemium? Affects the Prisma billing schema and the Razorpay/Stripe price IDs now.
- **Onboarding:** does a new org get sample data (demo contacts/deals) to reduce empty-state confusion?
- **Data import:** is CSV import from Excel/another CRM in scope for v1? If not, early customers may not adopt without it — flag as a risk, not just a nice-to-have.
- **Mobile:** responsive web only, or a native/PWA mobile experience? Reps often need this in the field.
- **Currency/localization:** single currency and English-only for MVP — confirm this is acceptable for the target market.
- **Data deletion/GDPR:** what happens on org deletion or a user's "delete my data" request?

---

## Suggested Final PRD Document Structure

Once every ⬜ above is resolved, assemble `PRD.md` in this order:

1. Overview & Goals (Section 1)
2. User Personas (Section 2)
3. Core Flow / Lifecycle (Section 3)
4. Data Model + ERD (Section 4)
5. Feature Specs — one sub-section per feature with user stories + acceptance criteria (Section 5)
6. RBAC & Permissions matrix (Section 6)
7. Non-Functional Requirements (Section 7)
8. Technical Architecture (Section 8)
9. MVP Scope & Release Checklist (Section 9)
10. Differentiation & Future Roadmap (Section 10)
11. Open Questions & Risks (Section 11)

This README can stay in the repo as the "how this PRD was built" doc, or be deleted once `PRD.md` is finalized.

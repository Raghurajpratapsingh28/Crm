# Entity-relationship diagram

PostgreSQL via Prisma. `users.id` is the Supabase `auth.users.id`. There is no `password_hash`. Every tenant-owned row has `organization_id`.

Deals are a single pipeline object. **Lead** is the first `pipeline_stages` row, not a separate table.

Activities and tasks use nullable foreign keys to `companies`, `contacts`, and `deals` instead of a polymorphic `(related_type, related_id)` pair.

```mermaid
erDiagram
  users ||--o{ organization_members : "memberships"
  users ||--o{ organization_members : "invites"
  organizations ||--|{ organization_members : "has"
  organizations ||--o{ companies : "has"
  organizations ||--o{ contacts : "has"
  organizations ||--o{ pipelines : "has"
  organizations ||--o{ pipeline_stages : "has"
  organizations ||--o{ deals : "has"
  organizations ||--o{ activities : "has"
  organizations ||--o{ tasks : "has"
  organizations ||--o{ notifications : "has"
  organizations ||--o| subscriptions : "bills"
  organizations ||--o{ invoices : "has"
  organizations ||--o{ payment_events : "has"
  organizations ||--o{ audit_logs : "has"
  organizations ||--o{ jobs : "queues"

  users ||--o{ companies : "owns"
  users ||--o{ contacts : "owns"
  users ||--o{ deals : "owns"
  users ||--o{ activities : "authors"
  users ||--o{ tasks : "assigned"
  users ||--o{ tasks : "created"
  users ||--o{ notifications : "receives"
  users ||--o{ audit_logs : "acts"

  companies ||--o{ contacts : "employs"
  companies ||--o{ deals : "has"
  companies ||--o{ activities : "linked"
  companies ||--o{ tasks : "linked"

  contacts ||--o{ deals : "primary"
  contacts ||--o{ activities : "linked"
  contacts ||--o{ tasks : "linked"

  pipelines ||--|{ pipeline_stages : "contains"
  pipelines ||--o{ deals : "contains"
  pipeline_stages ||--o{ deals : "current"

  deals ||--o{ activities : "timeline"
  deals ||--o{ tasks : "followups"

  users {
    uuid id PK "Supabase auth.users.id"
    string email UK
    string full_name
    string avatar_url
    timestamptz created_at
    timestamptz updated_at
  }

  organizations {
    uuid id PK
    string name
    enum plan
    string timezone
    char currency
    timestamptz created_at
    timestamptz updated_at
  }

  organization_members {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    enum role
    enum department
    uuid invited_by FK
    enum status
    timestamptz created_at
    timestamptz updated_at
  }

  companies {
    uuid id PK
    uuid organization_id FK
    string name
    string industry
    int employee_count
    string website
    uuid owner_id FK
    text[] tags
    string notes
    timestamptz created_at
    timestamptz updated_at
  }

  contacts {
    uuid id PK
    uuid organization_id FK
    string first_name
    string last_name
    string email
    string phone
    string job_title
    uuid company_id FK
    string industry
    enum source
    uuid owner_id FK
    text[] tags
    string notes
    timestamptz created_at
    timestamptz updated_at
  }

  pipelines {
    uuid id PK
    uuid organization_id FK
    string name
  }

  pipeline_stages {
    uuid id PK
    uuid organization_id FK
    uuid pipeline_id FK
    string name
    int order
    boolean is_won
    boolean is_lost
  }

  deals {
    uuid id PK
    uuid organization_id FK
    string name
    uuid company_id FK
    uuid primary_contact_id FK
    uuid pipeline_id FK
    uuid stage_id FK
    uuid owner_id FK
    decimal amount
    char currency
    date expected_close_date
    int probability
    enum lost_reason
    timestamptz created_at
    timestamptz updated_at
  }

  activities {
    uuid id PK
    uuid organization_id FK
    enum type
    uuid author_id FK
    uuid company_id FK
    uuid contact_id FK
    uuid deal_id FK
    string content
    timestamptz occurred_at
    json metadata
  }

  tasks {
    uuid id PK
    uuid organization_id FK
    string title
    string description
    uuid assignee_id FK
    uuid created_by FK
    enum status
    timestamptz due_date
    timestamptz completed_at
  }

  notifications {
    uuid id PK
    uuid organization_id FK
    uuid user_id FK
    enum type
    string title
    string message
    string entity_type
    string entity_id
    json payload
    string dedupe_key UK
    timestamptz read_at
  }

  subscriptions {
    uuid id PK
    uuid organization_id FK_UK
    enum provider
    enum status
    decimal amount
    char currency
  }

  invoices {
    uuid id PK
    uuid organization_id FK
    enum provider
    string provider_invoice_id
    decimal amount
    char currency
    enum status
  }

  payment_events {
    uuid id PK
    uuid organization_id FK
    enum provider
    string provider_event_id
    timestamptz processed_at
  }

  audit_logs {
    uuid id PK
    uuid organization_id FK
    uuid actor_id FK
    enum action
    string entity_type
    string entity_id
    timestamptz created_at
  }

  jobs {
    uuid id PK
    uuid organization_id FK
    string type
    json payload
    enum status
    int attempts
    int max_attempts
    timestamptz available_at
    timestamptz locked_at
    string locked_by
    timestamptz processed_at
    timestamptz failed_at
    string request_id
    string error
  }
```

## Default sales stages

`Lead → Contacted → Qualified → Meeting → Proposal → Negotiation → Won | Lost`

`Won` has `is_won = true`. `Lost` has `is_lost = true`.

## Integrity rules

| Rule | How |
|---|---|
| Tenant isolation | `organization_id` on every business table; API queries must include it |
| Auth | `users.id` = Supabase UUID; no password columns |
| Money | `Decimal(14,2)` plus explicit `Char(3)` currency |
| Org locale | `organizations.timezone` (IANA) and `organizations.currency` |
| One subscription | `subscriptions.organization_id` unique |
| Payment idempotency | unique `(provider, provider_event_id)` |
| Contact email | unique `(organization_id, email)` |
| Pipeline names | unique `(organization_id, name)` and `(pipeline_id, order)` |
| Deal links | required FKs to company, primary contact, pipeline, stage, owner |

## Sensitive audit actions

`USER_INVITED`, `USER_ROLE_CHANGED`, `USER_DEACTIVATED`, `RECORD_DELETED`, `BILLING_CHECKOUT_CREATED`, `SUBSCRIPTION_UPDATED`, `ORGANIZATION_UPDATED`, `PERMISSION_CHANGED`.

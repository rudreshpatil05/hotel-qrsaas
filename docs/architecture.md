# GuestQR architecture

## Phase 1 and Phase 2 boundary

The repository starts as a small monorepo:

```text
guestqr/
├── src/                 # guest-web MVP (Vite + React)
├── services/
│   └── api/             # Express + TypeScript API
├── docs/
└── .github/workflows/
```

The API is the trust boundary. Browser code can request actions, but it cannot
choose a tenant, role, price, payment status or state transition.

## Tenant and identity model

Hotels are tenants. A staff user belongs to exactly one hotel, while a
`SUPER_ADMIN` has platform scope. Access tokens carry the authenticated user
identity and tenant context. API middleware validates the token, then role
middleware authorizes the action. Service queries must always include the
authenticated tenant scope.

Refresh tokens are revalidated against the current user record before new
tokens are issued. Deactivation and password changes therefore invalidate
refreshing sessions, and current database role/tenant values are used instead
of stale token claims.

Guest access uses a separate short-lived QR session; it never reuses staff JWTs.
Orders store the guest session identifier. Billing and invoice retrieval require
both the QR context and that session identifier so guests sharing a room QR
cannot read one another's payment history.

### Tenant isolation contract

`requireTenant` resolves the tenant from the authenticated JWT and rejects a
hotel-admin or staff request whose route tenant differs. Route handlers then
use that resolved value in every Sequelize `where` clause. This applies to
hotels, rooms, staff, menus, orders, QR codes, services, payments, analytics,
billing, integrations and CMS records as those modules are introduced. A
super-admin is the only role with platform-wide scope, and cross-tenant access
is still explicit in the route and query.

Administrative writes are validated with Zod and append an `audit_logs` row
containing the tenant, actor, action and resource. Audit rows themselves are
tenant-scoped and cannot be used to enumerate another hotel.

## Data direction

Sequelize migrations will own schema changes. Tenant-owned tables will include
an indexed `hotel_id` foreign key. Financial and workflow modules will use
transactions and append-only history tables rather than overwriting audit data.
PMS external identifiers are stored in `pms_resource_mappings` with a hotel
scope and are checked before any PMS read or write.

## Planned phases

1. Architecture, repository, database and authentication
2. Hotel onboarding, tenancy and RBAC hardening (current)
3. QR sessions and guest experience
4. Menu and ordering
5. Kitchen display
6. Service requests and staff app
7. Payments and billing
8. Notifications
9. WiFi integrations
10. CMS and local guide
11. Reviews and analytics
12. PMS integrations
13. Security, performance and testing
14. AWS deployment and monitoring

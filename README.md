# GuestQR

GuestQR is a multi-tenant hotel guest-services platform for Indian hotels. Guests
use a hotel-specific QR code to access food ordering, service requests, hotel
information, billing and feedback without installing an app.

## Repository status

The repository contains the Phase 10 production-readiness foundation:

- `src/` contains the responsive guest-web MVP.
- `services/api/` contains the tenant-aware API and authentication foundation.
- `/admin` contains the Ant Design hotel administration dashboard foundation.
- The guest PWA resolves `/qr/<opaque-identifier>` into a temporary, hotel-scoped guest session.
- `/kitchen` provides a hotel-scoped real-time kitchen display and `/staff/requests` provides the service queue.
- `staff_app/` contains the Android-first Flutter staff application scaffold.
- Razorpay payment verification, webhook handling, refunds and digital billing are available when gateway credentials are configured.
- Interakt notifications, provider-neutral WiFi integration boundaries, tenant CMS content and multilingual local guide management are available.
- Reviews, database-backed analytics, report exports and a restricted super-admin platform dashboard are available.
- PostgreSQL and Sequelize are used for durable service data.
- Authentication uses short-lived JWT access tokens and database-revalidated refresh tokens.
- Refresh tokens are revalidated against active users and password-change timestamps.
- Guest billing is scoped to the guest session that created an order.
- PMS external identifiers require an explicit hotel-owned mapping before provider calls.
- CI validates API type-checks/tests/audits, frontend builds, and Flutter analysis/tests.

Feature modules are intentionally being added in phases. External systems such
as Razorpay, PMS, WiFi controllers and WhatsApp are integration boundaries, not
simulated success paths.

## Local development

### Guest web

```powershell
npm install
npm run dev
```

### API

```powershell
Set-Location services/api
npm install
Copy-Item .env.example .env
npm run dev
```

The API exposes `GET /health` and binds to `http://localhost:4000` by default.
The API requires PostgreSQL for authenticated flows; do not use production
credentials locally.

## Security principles

- Every hotel-owned record is scoped by tenant identity in the API layer.
- Protected routes require both authentication and role authorization.
- Client-provided totals, roles and payment state are never trusted; payment amounts and status are verified server-side.
- Secrets belong in environment variables and are excluded from Git.
- Authentication and authorization failures are explicit and audit-friendly.

See [docs/architecture.md](docs/architecture.md) for the Phase 1 boundary and
the Phase 2 tenancy boundary and planned module sequence.

## Production deployment checklist

1. Apply SQL migrations in order with `DB_SYNC=false`, including
   `services/api/migrations/003_phase10_security.sql`.
2. Configure separate secrets and databases for development, staging, and
   production. Never copy `.env` files or credentials into Git.
3. Configure the GitHub Actions production environment with required approval
   rules before adding a deployment job.
4. Configure PostgreSQL backups, Redis availability, Sentry, CloudWatch,
   CloudFront, S3 lifecycle rules, Razorpay, Interakt, and the selected PMS.
5. Run the API regression suite, frontend build, Flutter tests, dependency
   audit, and a staging smoke test before promotion.

External gateway credentials and deployed infrastructure are intentionally not
invented in local development; without them the corresponding integrations
return explicit configuration errors.

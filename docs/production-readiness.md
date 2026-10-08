# GuestQR production readiness

## Verified locally

- API TypeScript compilation and regression tests pass.
- Hotel A tokens are rejected on Hotel B tenant routes.
- Platform routes require the `super_admin` role.
- Guest sessions are signed, short-lived, and separate from staff tokens.
- Refresh requests reload the user and reject inactive, deactivated, or
  password-invalidated accounts.
- Orders persist the creating guest session; billing and invoice PDF queries
  require that session and the QR context.
- PMS calls require a hotel-owned external-resource mapping.
- Razorpay signatures, webhook signatures, amount association, duplicate
  handling, and refund bounds are covered by tests.
- S3 uploads are signed, tenant-scoped, allowlisted, and size-limited.
- API dependency audit reports no high-severity vulnerabilities after the
  Sequelize `uuid` override.
- Frontend production build passes; Flutter validation is configured in CI.

## Required staging verification

The repository cannot verify external infrastructure without credentials. Before
production promotion, staging must run:

1. Apply all SQL migrations in order with `DB_SYNC=false`.
2. Verify PostgreSQL backups and restore a non-production snapshot.
3. Configure Redis, S3/CloudFront, Sentry, CloudWatch, Razorpay, Interakt, and
   the selected PMS adapter.
4. Run real Razorpay test-mode payment/webhook/refund flows.
5. Run Socket.io tenant isolation checks with two authenticated hotels.
6. Run browser E2E and device tests against the deployed staging URL.
7. Run OWASP ZAP and an authenticated load test using non-production data.

Production deployment must be a protected GitHub environment with required
review approval. No workflow in this repository silently deploys without that
approval or invents credentials.

## Security boundaries

Provider credentials are server-only environment variables. Client uploads use
short-lived presigned URLs and never receive AWS write credentials. Request
logs include correlation IDs but omit request bodies and sensitive credential
fields. PMS identifiers are not accepted for provider calls until mapped to the
authenticated hotel.

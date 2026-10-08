# GuestQR API (Phase 3)

Standalone Express/TypeScript backend; the existing Vite guest frontend is unchanged.

## Run

```sh
cp .env.example .env
npm install
npm run typecheck
npm run dev
```

`DATABASE_URL` and both JWT secrets are validated at startup. `DB_SYNC=false` is the safe default; set it to `true` only for a new development database. Production schema changes should use migrations. `GET /health` is dependency-free, while `POST /api/v1/auth/login` and `POST /api/v1/auth/refresh` provide JWT access/refresh tokens.

Blank optional integration variables in `.env` are treated as unset, so local development can run without Razorpay, Interakt, S3, Redis, Sentry, CloudWatch, or PMS credentials. PostgreSQL is still required by `src/server.ts` before the API begins listening.

## Phase 2 tenant/RBAC API

Users belong to exactly one `Hotel` tenant through `hotelId`; access tokens carry tenant and role claims. `owner`, `admin`, and `hotel_admin` can manage only their tenant; `super_admin` can manage any tenant. Passwords are never returned. Every protected hotel route runs `requireTenant` before its handler, and every query includes the resolved tenant ID. Client-provided hotel IDs cannot change a hotel-admin or staff user's tenant.

- `PUT /api/v1/hotels/me` — update the caller's hotel (`name`, `slug`); requires hotel-admin role.
- `POST /api/v1/hotels/me/onboarding` — create/update the caller's complete hotel profile, including address, contacts, logo, colors, GST, timezone, currency, language, settings and configuration.
- `PUT /api/v1/hotels/me/profile` — update the complete hotel profile and record an audit entry.
- `GET /api/v1/hotels/:hotelId/users` — list users in the caller's tenant.
- `POST /api/v1/hotels/:hotelId/users` — create a user with `{email,password,role}`. Non-super-admins may not assign `owner` or `super_admin`.
- `GET /api/v1/hotels/:hotelId/tenant-example` — protected tenant-scoped example. A mismatched tenant returns `403`; super-admins may cross tenant boundaries.
- `GET /api/v1/hotels/:hotelId/rooms` and `POST/PATCH/DELETE` room routes — manage room number/name, floor and active/disabled status.
- `GET/POST/PATCH /api/v1/hotels/:hotelId/staff` — manage staff role, department, permissions and active status; credential resets and important changes are audited.
- `GET /api/v1/hotels/:hotelId/audit-logs` — view the latest tenant-scoped administrative activity.
- `POST /api/v1/hotels/:hotelId/qrs` — create a QR record with optional `{label}`. The one-time returned `identifier` is the only value suitable for printing; raw database IDs and token hashes are never returned.
- `POST /api/v1/hotels/:hotelId/qrs` accepts `type` (`ROOM`, `TABLE`, `COMMON_AREA`, `SERVICE`, `WIFI`), optional same-hotel `roomId`, and `targetLabel`.
- `GET /api/v1/hotels/:hotelId/qrs` — list QR records (without secrets), including type, assignment and scan counts.
- `POST /api/v1/hotels/:hotelId/qrs/:publicId/disable` — disable a QR.
- `POST /api/v1/hotels/:hotelId/qrs/:publicId/regenerate` — revoke the old identifier and return a new one.
- `GET /api/v1/hotels/:hotelId/qrs/:publicId/download` — return a QR image data URL for download/printing. Room codes use A5 metadata; other codes use A4 metadata.
- `GET /api/v1/hotels/:hotelId/qrs/analytics` — tenant-scoped scan analytics.
- `GET /api/v1/public/qr/:identifier` — resolve an active printed QR into a short-lived guest session.
- `GET /api/v1/guest/context` — validate a guest session and return hotel branding plus the assigned room/table context.
- `POST /api/v1/guest/events` — record guest conversion events for the current session (`PAGE_VIEW`, `MENU_VIEW`, `CHECKOUT_STARTED`, `FEEDBACK_SUBMITTED`).

Tenant IDs come exclusively from JWT claims for normal users. Validation failures return a generic `400 Invalid request`; unexpected errors return a generic `500` response without database details. No secrets are committed.

The Phase 2 schema additions are in `migrations/002_phase2_tenant_admin.sql`. Phase 10 security hardening is in `migrations/003_phase10_security.sql`. Production deployments must apply migrations explicitly; `DB_SYNC=true` is only suitable for disposable development databases.

QR identifiers are opaque random tokens; only their SHA-256 hash and an AES-GCM encrypted token are persisted. The encrypted value is used only to render a later admin download and never returned by the API. Guest session JWTs use a separate secret and token type from staff access/refresh JWTs, expire by `JWT_GUEST_TTL` (30 minutes by default), and include only hotel and QR context. Disabled or regenerated QRs cannot create or validate guest contexts. Payments are intentionally out of scope for Phase 3.

## Phase 4 menu and ordering

- `GET /api/v1/guest/menu` returns active menu items with category, image, vegetarian flag, GST rate, preparation time and customization schema.
- `GET/POST/PATCH/DELETE /api/v1/hotels/:hotelId/menu/categories` manages tenant categories.
- `GET/POST/PATCH/DELETE /api/v1/hotels/:hotelId/menu/items` manages tenant menu items, availability, pricing, GST, photos and customizations.
- `POST /api/v1/guest/orders` accepts guest/contact/location/payment-method details and cart lines. It reloads active menu rows by the guest hotel and calculates subtotal, GST, discounts and total server-side. Client prices and totals are ignored.
- Order creation stores item snapshots, an invoice, and an initial `PENDING_PAYMENT` status-history record in one transaction.

## Phase 5 kitchen and service operations

- Socket.io staff connections validate the access JWT, role and tenant, then join only `kitchen:<hotelId>` and `services:<hotelId>` rooms.
- `/kitchen` is the touch-friendly dark kitchen display with live order refreshes and controlled status actions.
- `/staff/requests` is the live service-request queue.
- `POST/GET /api/v1/guest/service-requests` creates and tracks hotel-scoped guest requests.
- `POST /api/v1/guest/service-requests/:requestId/rating` rates completed requests.
- `GET/PATCH /api/v1/hotels/:hotelId/service-requests` provides staff queue and lifecycle actions.
- Service requests use `PENDING → ACCEPTED → IN_PROGRESS → COMPLETED`, with `REJECTED` and `CANCELLED` alternatives and SLA timestamps.
- `staff_app/` contains the Android-first Flutter staff app scaffold. It uses secure JWT storage, Socket.io notifications, and dependencies for push notifications and photo uploads.

## Phase 4 menu and ordering

Menu and order data are tenant-scoped. The guest session must be sent as `Authorization: Bearer <guestSessionToken>`.

- `GET /api/v1/guest/menu` — returns active categories/items for the guest's hotel.
- `POST /api/v1/guest/orders` — accepts `{items:[{menuItemId,quantity,customizations}],guestNote}`. Prices and names are read from active server-side menu rows; client totals are ignored. Orders start as `PENDING_PAYMENT` and create an initial status history row atomically.
- `GET /api/v1/hotels/:hotelId/orders` — hotel-admin order list, including items/history.
- `POST /api/v1/hotels/:hotelId/orders/:orderNumber/status` — kitchen/admin transition using `{status,note}`.

Supported statuses are `PENDING_PAYMENT`, `CONFIRMED`, `ACCEPTED`, `PREPARING`, `READY`, `OUT_FOR_DELIVERY`, `DELIVERED`, `CANCELLED`, `FAILED`, and `REFUNDED`. Transitions are explicitly allow-listed and invalid transitions return `409`.

## Phase 6 payments and digital billing

Razorpay is an explicit server-side integration boundary. Set `RAZORPAY_KEY_ID`, `RAZORPAY_KEY_SECRET`, and `RAZORPAY_WEBHOOK_SECRET` only in the API environment. UPI, cards, net banking and supported wallets are offered by Razorpay Checkout; the API never accepts a browser-provided payment status.

- `POST /api/v1/guest/payments/order` — creates an amount-locked Razorpay order for a guest's online order. Requires a caller-supplied idempotency key (at least 16 characters).
- `POST /api/v1/guest/payments/verify` — verifies the Razorpay order/payment signature, tenant/session association and server-side amount before confirming the order.
- `POST /api/v1/payments/razorpay/webhook` — verifies the raw webhook body and `x-razorpay-signature`; replayed event/payment IDs are acknowledged without applying changes twice.
- `POST /api/v1/hotels/:hotelId/payments/:paymentId/refund` — creates a full or partial Razorpay refund with an idempotency key and updates the payment/invoice transactionally.
- `GET /api/v1/guest/billing` — returns tenant/session-scoped invoices, payments and outstanding balance.
- `GET /api/v1/guest/invoices/:invoiceNumber/pdf` — returns a server-generated PDF invoice.

Payments store gateway references, amount/currency, method, status, failure details, refund totals and idempotency/replay markers. Invoices store line snapshots, GST details, discounts, adjustments, payments and balance. GST/e-invoice compliance is intentionally modular and depends on hotel configuration and applicable external APIs.

## Phase 7 notifications, WiFi, CMS and local guide

- `src/notifications.ts` defines the provider-neutral notification contract. `InteraktProvider` is selected only when `INTERAKT_API_KEY` is configured; business routes call `sendNotification` rather than provider-specific code. Template names correspond to notification types such as `order_received`, `payment_confirmation`, and `feedback_request`.
- `PUT /api/v1/hotels/:hotelId/wifi/settings` stores provider (`CAPTIVE_PORTAL` or `GENERIC_CONTROLLER`), guest/staff/premium SSIDs and bandwidth limits. `POST /api/v1/guest/wifi/session` performs the generic verification/session boundary. Actual router authentication, usage and disconnection must be implemented by a hotel-specific `WifiIntegration` adapter.
- `GET/POST/PATCH/DELETE /api/v1/hotels/:hotelId/content` manages tenant CMS entries for hotel information, facilities, restaurant, spa, pool, gym, rules, timings, pricing and emergency contacts.
- `GET/POST/PATCH/DELETE /api/v1/hotels/:hotelId/local-guide` manages tenant local-guide entries for attractions, restaurants, shopping, transport and events.
- Guests read published content through `/api/v1/guest/content?language=en|hi` and `/api/v1/guest/local-guide?language=en|hi`. Every entry stores locale-keyed translations and requires English, while Hindi and future languages are data rather than code.

## Phase 8 reviews, analytics and platform administration

- `POST /api/v1/guest/reviews` accepts service/order ratings and comments only for the current guest tenant/session.
- `GET/PATCH /api/v1/hotels/:hotelId/reviews` lets hotel admins filter reviews and respond.
- `GET /api/v1/hotels/:hotelId/analytics?start=...&end=...` calculates metrics from `guest_events`, orders, order items, services, payments and reviews; no frontend statistics are fabricated.
- `GET /api/v1/hotels/:hotelId/reports/:report/export?format=csv|pdf` exports orders, revenue, menu performance, services, staff performance, reviews or payments for a bounded date range.
- `/super-admin` and `/api/v1/platform/*` are restricted to `super_admin`; hotel admins receive `403` and cannot read platform-wide data. Platform endpoints cover hotel status/subscription monitoring and aggregate system counts.

## Phase 9 PMS, storage, performance and observability

- `src/pms.ts` defines guest, room, check-in/out, room-charge and billing-sync operations. Without `PMS_PROVIDER`, `PMS_BASE_URL` and `PMS_API_KEY`, the unconfigured adapter returns `503`; it never fakes PMS data.
- PMS external guest and room identifiers must first be registered through the tenant-scoped mapping endpoint. This prevents a hotel administrator from using another hotel's external PMS identifiers.
- Refresh requests reload the user from PostgreSQL and reject inactive, deactivated, or password-invalidated users. Guest billing and invoice PDFs are scoped to the creating guest session, not merely a shared room QR.
- `POST /api/v1/hotels/:hotelId/uploads/sign` issues a five-minute S3 signed upload URL only for allowlisted image/PDF types and bounded sizes. Keys are tenant-scoped; clients never receive unrestricted S3 credentials. Configure `S3_BUCKET` and `CLOUDFRONT_URL` for delivery.
- `src/cache.ts` provides optional Redis caching for tenant menu responses with short TTLs and invalidation after menu writes. `REDIS_URL` is optional and cache failures do not replace database reads.
- PostgreSQL uses bounded connection pooling. API responses include `x-correlation-id`; structured Winston logs record method, path, status and duration without credentials or guest payloads. Sentry and CloudWatch are enabled only when `SENTRY_DSN`/`CLOUDWATCH_LOG_GROUP` are configured.

## Phase 5 kitchen display

The API server attaches Socket.io at `/socket.io`. Staff connect with an access JWT in the Socket.io `auth.token` field (or Bearer authorization header). `staff`, `owner`, `admin`, `hotel_admin`, and `super_admin` may connect; the token's `hotelId` determines the private `kitchen:<hotelId>` room. Unauthorized roles/tokens are rejected.

The server emits `order-created` and `order-status-updated` only to that hotel's room. Payloads contain only `orderNumber` and, for status updates, `status`; no JWTs, database IDs, prices, or guest data are broadcast. Staff may transition only `ACCEPTED → PREPARING`, `PREPARING → READY`, and `READY → OUT_FOR_DELIVERY/DELIVERED`; administrative roles may use the broader allow-list. Existing REST endpoints remain available.

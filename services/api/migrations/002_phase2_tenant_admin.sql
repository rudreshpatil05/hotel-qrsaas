-- GuestQR Phase 2: hotel onboarding and admin foundation.
-- Apply with the project's migration runner before deploying with DB_SYNC=false.
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS address JSONB;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS "contactDetails" JSONB;
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS "logoUrl" VARCHAR(2048);
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS "primaryColor" VARCHAR(7) NOT NULL DEFAULT '#252b21';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS "secondaryColor" VARCHAR(7) NOT NULL DEFAULT '#d8f24d';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS configuration JSONB;
ALTER TABLE users ADD COLUMN IF NOT EXISTS permissions JSONB;
ALTER TABLE rooms ADD COLUMN IF NOT EXISTS floor VARCHAR(32);

CREATE INDEX IF NOT EXISTS rooms_hotel_id_status ON rooms ("hotelId", status);
CREATE INDEX IF NOT EXISTS users_hotel_id_role ON users ("hotelId", role);
CREATE INDEX IF NOT EXISTS audit_logs_hotel_id_created_at ON audit_logs ("hotelId", "createdAt");

ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS type VARCHAR(20) NOT NULL DEFAULT 'ROOM';
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS "roomId" UUID;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS "targetLabel" VARCHAR(120);
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS "tokenCiphertext" TEXT;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS "scanCount" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE qr_codes ADD COLUMN IF NOT EXISTS "lastScannedAt" TIMESTAMP WITH TIME ZONE;
CREATE TABLE IF NOT EXISTS guest_events (
  id UUID PRIMARY KEY,
  "hotelId" UUID NOT NULL,
  "qrId" UUID NOT NULL,
  "sessionId" VARCHAR(80),
  "eventType" VARCHAR(32) NOT NULL,
  metadata JSONB,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS guest_events_hotel_id_created_at ON guest_events ("hotelId", "createdAt");

ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS "gstRateBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS "preparationMinutes" INTEGER NOT NULL DEFAULT 20;
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS "imageUrl" VARCHAR(2048);
ALTER TABLE menu_items ADD COLUMN IF NOT EXISTS vegetarian BOOLEAN NOT NULL DEFAULT TRUE;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "gstCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "discountCents" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "guestName" VARCHAR(120);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "guestPhone" VARCHAR(32);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "deliveryLocation" VARCHAR(200);
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "paymentMethod" VARCHAR(20) NOT NULL DEFAULT 'PAY_AT_HOTEL';
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS "gstRateBps" INTEGER NOT NULL DEFAULT 0;
ALTER TABLE order_items ADD COLUMN IF NOT EXISTS "specialInstructions" VARCHAR(500);

CREATE TABLE IF NOT EXISTS service_requests (
  id UUID PRIMARY KEY,
  "hotelId" UUID NOT NULL,
  "qrPublicId" VARCHAR(32) NOT NULL,
  "roomOrTable" VARCHAR(200) NOT NULL,
  category VARCHAR(32) NOT NULL,
  description VARCHAR(1000) NOT NULL,
  "photoUrl" VARCHAR(2048),
  status VARCHAR(32) NOT NULL DEFAULT 'PENDING',
  "rejectionReason" VARCHAR(500),
  "staffUserId" UUID,
  "staffNotes" VARCHAR(1000),
  "proofUrl" VARCHAR(2048),
  rating INTEGER,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "acceptedAt" TIMESTAMP WITH TIME ZONE,
  "startedAt" TIMESTAMP WITH TIME ZONE,
  "completedAt" TIMESTAMP WITH TIME ZONE,
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS service_requests_hotel_id_status ON service_requests ("hotelId", status);

CREATE TABLE IF NOT EXISTS invoices (
  id UUID PRIMARY KEY,
  "hotelId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "invoiceNumber" VARCHAR(32) NOT NULL UNIQUE,
  currency VARCHAR(3) NOT NULL,
  "subtotalCents" INTEGER NOT NULL,
  "gstCents" INTEGER NOT NULL,
  "discountCents" INTEGER NOT NULL,
  "adjustmentCents" INTEGER NOT NULL DEFAULT 0,
  "totalCents" INTEGER NOT NULL,
  "paidCents" INTEGER NOT NULL DEFAULT 0,
  status VARCHAR(20) NOT NULL DEFAULT 'UNPAID',
  "gstDetails" JSONB,
  "lineItems" JSONB NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE ("hotelId", "orderId")
);
CREATE INDEX IF NOT EXISTS invoices_hotel_id_number ON invoices ("hotelId", "invoiceNumber");

CREATE TABLE IF NOT EXISTS payments (
  id UUID PRIMARY KEY,
  "hotelId" UUID NOT NULL,
  "orderId" UUID NOT NULL,
  "invoiceId" UUID,
  "amountCents" INTEGER NOT NULL,
  currency VARCHAR(3) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'CREATED',
  "gatewayOrderId" VARCHAR(80) UNIQUE,
  "gatewayPaymentId" VARCHAR(80) UNIQUE,
  "paymentMethod" VARCHAR(40),
  "idempotencyKey" VARCHAR(120) NOT NULL,
  "webhookEventId" VARCHAR(160),
  "refundedAmountCents" INTEGER NOT NULL DEFAULT 0,
  "refundIdempotencyKey" VARCHAR(120),
  "failureReason" VARCHAR(500),
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE ("hotelId", "idempotencyKey")
);
CREATE INDEX IF NOT EXISTS payments_hotel_id_order_id ON payments ("hotelId", "orderId");

CREATE TABLE IF NOT EXISTS hotel_content (
  id UUID PRIMARY KEY,
  "hotelId" UUID NOT NULL,
  type VARCHAR(32) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  translations JSONB NOT NULL,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE ("hotelId", slug)
);
CREATE INDEX IF NOT EXISTS hotel_content_hotel_type_active ON hotel_content ("hotelId", type, active);

CREATE TABLE IF NOT EXISTS local_guide_items (
  id UUID PRIMARY KEY,
  "hotelId" UUID NOT NULL,
  type VARCHAR(24) NOT NULL,
  slug VARCHAR(100) NOT NULL,
  translations JSONB NOT NULL,
  location JSONB,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  "sortOrder" INTEGER NOT NULL DEFAULT 0,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE ("hotelId", slug)
);
CREATE INDEX IF NOT EXISTS local_guide_hotel_type_active ON local_guide_items ("hotelId", type, active);

ALTER TABLE hotels ADD COLUMN IF NOT EXISTS status VARCHAR(20) NOT NULL DEFAULT 'ONBOARDING';
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS "subscriptionPlan" VARCHAR(80);
ALTER TABLE hotels ADD COLUMN IF NOT EXISTS "subscriptionStatus" VARCHAR(20) NOT NULL DEFAULT 'TRIAL';
CREATE TABLE IF NOT EXISTS reviews (
  id UUID PRIMARY KEY,
  "hotelId" UUID NOT NULL,
  "qrPublicId" VARCHAR(32) NOT NULL,
  "sessionId" VARCHAR(80) NOT NULL,
  "targetType" VARCHAR(16) NOT NULL,
  "targetId" UUID,
  rating INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5),
  comment VARCHAR(2000),
  response VARCHAR(2000),
  "respondedAt" TIMESTAMP WITH TIME ZONE,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS reviews_hotel_created_at ON reviews ("hotelId", "createdAt");

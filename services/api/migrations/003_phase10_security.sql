-- Phase 10 security hardening.
-- Apply before enabling PMS operations in an environment.
ALTER TABLE orders ADD COLUMN IF NOT EXISTS "sessionId" VARCHAR(80);
CREATE INDEX IF NOT EXISTS orders_hotel_id_session_id ON orders ("hotelId", "sessionId");

CREATE TABLE IF NOT EXISTS pms_resource_mappings (
  id UUID PRIMARY KEY,
  "hotelId" UUID NOT NULL,
  "resourceType" VARCHAR(16) NOT NULL CHECK ("resourceType" IN ('GUEST', 'ROOM')),
  "externalId" VARCHAR(160) NOT NULL,
  "createdAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  "updatedAt" TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT NOW(),
  UNIQUE ("hotelId", "resourceType", "externalId")
);
CREATE INDEX IF NOT EXISTS pms_resource_mappings_hotel_type
  ON pms_resource_mappings ("hotelId", "resourceType");

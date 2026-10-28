-- D-54 (owner decision 2026-10-26): billing removed by the template's module manifest
-- (scripts/foundation-modules.ts). The template's *_billing_* migrations stay in the history (an applied
-- migration is never edited or removed); this clone-owned migration takes the tables out of the database
-- so `prisma migrate diff` against the schema (which no longer has billing.prisma) stays empty.
ALTER TABLE "BillingAccount" DROP CONSTRAINT IF EXISTS "BillingAccount_orgId_fkey";
DROP TABLE IF EXISTS "BillingAccount";
DROP TABLE IF EXISTS "StripeEvent";

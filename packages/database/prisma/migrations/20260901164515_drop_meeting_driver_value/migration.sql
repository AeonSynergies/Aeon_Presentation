-- Pricing-driver restructuring: every driver value now lives in `answers`, keyed by
-- pricing-model id, instead of a single deck-level default column.
ALTER TABLE "meetings" DROP COLUMN "driverValue";

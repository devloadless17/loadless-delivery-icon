-- Drop the adjustment category. The sign is the category.
--
-- FINE / BONUS / ADVANCE / CORRECTION asked an admin to file a piece of money
-- under a heading before they could describe it, and three of the four headings
-- meant the same thing arithmetically: the driver owes more. The fourth meant he
-- owes less. So the taxonomy carried no information the signed amount did not
-- already carry, while adding a decision, a way to be wrong, and a dropdown
-- between a person and the sentence that actually explains the charge.
--
-- What a driver wants to know is "why is this here", and "Lost the thermal bag"
-- answers that better than "Fine" ever did. The reason column is required and
-- CHECKed to at least 3 characters, so the explanation cannot be skipped.
--
-- Safe to drop outright: settlement_adjustments is empty in every environment
-- (verified in production before writing this), so there is nothing to migrate.
ALTER TABLE "settlement_adjustments" DROP CONSTRAINT adjustment_sign_by_type;

ALTER TABLE "settlement_adjustments" DROP COLUMN "type";

DROP TYPE "AdjustmentType";

-- A zero adjustment is not an adjustment; the direction has to be legible.
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT adjustment_amount_nonzero
  CHECK ("amount" <> 0);

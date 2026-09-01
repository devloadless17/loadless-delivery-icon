-- CreateEnum
CREATE TYPE "SettlementStatus" AS ENUM ('SETTLED', 'VOIDED');

-- CreateEnum
CREATE TYPE "AdjustmentType" AS ENUM ('FINE', 'BONUS', 'ADVANCE', 'CORRECTION');

-- AlterTable
ALTER TABLE "orders" ADD COLUMN     "settlement_id" TEXT;

-- CreateTable
CREATE TABLE "driver_settlements" (
    "id" TEXT NOT NULL,
    "settlement_number" TEXT NOT NULL,
    "driver_id" TEXT NOT NULL,
    "period_start" TIMESTAMP(3),
    "period_end" TIMESTAMP(3) NOT NULL,
    "status" "SettlementStatus" NOT NULL DEFAULT 'SETTLED',
    "settled_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "collected_by_user_id" TEXT NOT NULL,
    "note" TEXT,
    "voided_at" TIMESTAMP(3),
    "voided_by_user_id" TEXT,
    "void_reason" TEXT,

    CONSTRAINT "driver_settlements_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_settlement_lines" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "order_count" INTEGER NOT NULL,
    "gross_charge" BIGINT NOT NULL,
    "commission_due" BIGINT NOT NULL,
    "adjustments_total" BIGINT NOT NULL,
    "brought_forward" BIGINT NOT NULL,
    "total_due" BIGINT NOT NULL,
    "amount_collected" BIGINT NOT NULL,
    "carried_forward" BIGINT NOT NULL,

    CONSTRAINT "driver_settlement_lines_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "settlement_adjustments" (
    "id" TEXT NOT NULL,
    "settlement_id" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "type" "AdjustmentType" NOT NULL,
    "amount" BIGINT NOT NULL,
    "reason" TEXT NOT NULL,
    "created_by_user_id" TEXT NOT NULL,
    "created_at" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "settlement_adjustments_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "driver_balances" (
    "driver_id" TEXT NOT NULL,
    "currency" "Currency" NOT NULL,
    "outstanding" BIGINT NOT NULL DEFAULT 0,
    "updated_at" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "driver_balances_pkey" PRIMARY KEY ("driver_id","currency")
);

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlements_settlement_number_key" ON "driver_settlements"("settlement_number");

-- CreateIndex
CREATE INDEX "driver_settlements_driver_id_settled_at_idx" ON "driver_settlements"("driver_id", "settled_at" DESC);

-- CreateIndex
CREATE INDEX "driver_settlements_settled_at_id_idx" ON "driver_settlements"("settled_at" DESC, "id" DESC);

-- CreateIndex
CREATE UNIQUE INDEX "driver_settlement_lines_settlement_id_currency_key" ON "driver_settlement_lines"("settlement_id", "currency");

-- CreateIndex
CREATE INDEX "settlement_adjustments_settlement_id_idx" ON "settlement_adjustments"("settlement_id");

-- CreateIndex
CREATE INDEX "orders_settlement_id_idx" ON "orders"("settlement_id");

-- AddForeignKey
ALTER TABLE "orders" ADD CONSTRAINT "orders_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "driver_settlements"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_settlements" ADD CONSTRAINT "driver_settlements_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_settlement_lines" ADD CONSTRAINT "driver_settlement_lines_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "driver_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "settlement_adjustments" ADD CONSTRAINT "settlement_adjustments_settlement_id_fkey" FOREIGN KEY ("settlement_id") REFERENCES "driver_settlements"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "driver_balances" ADD CONSTRAINT "driver_balances_driver_id_fkey" FOREIGN KEY ("driver_id") REFERENCES "drivers"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

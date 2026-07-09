-- AlterTable
ALTER TABLE "PricingRule" ADD COLUMN     "amount" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "mode" TEXT NOT NULL DEFAULT 'per_char';

-- CreateTable
CREATE TABLE "FieldCondition" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "triggerFieldId" TEXT NOT NULL,
    "operator" TEXT NOT NULL DEFAULT 'equals',
    "value" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FieldCondition_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FieldCondition_shop_productId_idx" ON "FieldCondition"("shop", "productId");

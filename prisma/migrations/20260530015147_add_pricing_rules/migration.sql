-- CreateTable
CREATE TABLE "PricingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "basePrice" REAL NOT NULL DEFAULT 0,
    "perCharPrice" REAL NOT NULL DEFAULT 0
);

-- CreateTable
CREATE TABLE "CharPriceGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pricingRuleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "characters" TEXT NOT NULL,
    "pricePerChar" REAL NOT NULL DEFAULT 0,
    CONSTRAINT "CharPriceGroup_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);

-- CreateIndex
CREATE INDEX "PricingRule_shop_productId_idx" ON "PricingRule"("shop", "productId");

-- CreateIndex
CREATE UNIQUE INDEX "PricingRule_shop_productId_fieldId_key" ON "PricingRule"("shop", "productId", "fieldId");

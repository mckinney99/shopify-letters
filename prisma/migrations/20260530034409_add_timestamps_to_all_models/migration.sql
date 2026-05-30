/*
  Warnings:

  - Added the required column `updatedAt` to the `CharPriceGroup` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `CustomizationField` table without a default value. This is not possible if the table is not empty.
  - Added the required column `updatedAt` to the `PricingRule` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_CharPriceGroup" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "pricingRuleId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "characters" TEXT NOT NULL,
    "pricePerChar" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL,
    CONSTRAINT "CharPriceGroup_pricingRuleId_fkey" FOREIGN KEY ("pricingRuleId") REFERENCES "PricingRule" ("id") ON DELETE CASCADE ON UPDATE CASCADE
);
INSERT INTO "new_CharPriceGroup" ("characters", "id", "label", "pricePerChar", "pricingRuleId", "updatedAt") SELECT "characters", "id", "label", "pricePerChar", "pricingRuleId", CURRENT_TIMESTAMP FROM "CharPriceGroup";
DROP TABLE "CharPriceGroup";
ALTER TABLE "new_CharPriceGroup" RENAME TO "CharPriceGroup";
CREATE TABLE "new_CustomizationField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "minChars" INTEGER,
    "maxChars" INTEGER,
    "allowedChars" TEXT,
    "disallowedChars" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_CustomizationField" ("allowedChars", "disallowedChars", "id", "label", "maxChars", "minChars", "position", "productId", "shop", "type", "updatedAt") SELECT "allowedChars", "disallowedChars", "id", "label", "maxChars", "minChars", "position", "productId", "shop", "type", CURRENT_TIMESTAMP FROM "CustomizationField";
DROP TABLE "CustomizationField";
ALTER TABLE "new_CustomizationField" RENAME TO "CustomizationField";
CREATE INDEX "CustomizationField_shop_productId_idx" ON "CustomizationField"("shop", "productId");
CREATE TABLE "new_PricingRule" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "fieldId" TEXT NOT NULL,
    "basePrice" REAL NOT NULL DEFAULT 0,
    "perCharPrice" REAL NOT NULL DEFAULT 0,
    "createdAt" DATETIME NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_PricingRule" ("basePrice", "fieldId", "id", "perCharPrice", "productId", "shop", "updatedAt") SELECT "basePrice", "fieldId", "id", "perCharPrice", "productId", "shop", CURRENT_TIMESTAMP FROM "PricingRule";
DROP TABLE "PricingRule";
ALTER TABLE "new_PricingRule" RENAME TO "PricingRule";
CREATE INDEX "PricingRule_shop_productId_idx" ON "PricingRule"("shop", "productId");
CREATE UNIQUE INDEX "PricingRule_shop_productId_fieldId_key" ON "PricingRule"("shop", "productId", "fieldId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

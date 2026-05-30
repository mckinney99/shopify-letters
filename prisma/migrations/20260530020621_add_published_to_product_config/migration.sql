/*
  Warnings:

  - Added the required column `updatedAt` to the `ProductConfig` table without a default value. This is not possible if the table is not empty.

*/
-- RedefineTables
PRAGMA defer_foreign_keys=ON;
PRAGMA foreign_keys=OFF;
CREATE TABLE "new_ProductConfig" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "enabled" BOOLEAN NOT NULL DEFAULT false,
    "published" BOOLEAN NOT NULL DEFAULT false,
    "updatedAt" DATETIME NOT NULL
);
INSERT INTO "new_ProductConfig" ("enabled", "id", "productId", "shop", "updatedAt") SELECT "enabled", "id", "productId", "shop", CURRENT_TIMESTAMP FROM "ProductConfig";
DROP TABLE "ProductConfig";
ALTER TABLE "new_ProductConfig" RENAME TO "ProductConfig";
CREATE UNIQUE INDEX "ProductConfig_shop_productId_key" ON "ProductConfig"("shop", "productId");
PRAGMA foreign_keys=ON;
PRAGMA defer_foreign_keys=OFF;

-- CreateTable
CREATE TABLE "CustomizationField" (
    "id" TEXT NOT NULL PRIMARY KEY,
    "shop" TEXT NOT NULL,
    "productId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'text',
    "minChars" INTEGER,
    "maxChars" INTEGER,
    "allowedChars" TEXT,
    "disallowedChars" TEXT,
    "position" INTEGER NOT NULL DEFAULT 0
);

-- CreateIndex
CREATE INDEX "CustomizationField_shop_productId_idx" ON "CustomizationField"("shop", "productId");

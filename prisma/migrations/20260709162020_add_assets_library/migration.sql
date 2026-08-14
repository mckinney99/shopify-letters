-- CreateTable
CREATE TABLE "FontAsset" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "FontAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorSet" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ColorSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ColorSetEntry" (
    "id" TEXT NOT NULL,
    "colorSetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "color" TEXT NOT NULL,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "ColorSetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "ImageAsset" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "url" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageAsset_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionSet" (
    "id" TEXT NOT NULL,
    "shop" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "OptionSet_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "OptionSetEntry" (
    "id" TEXT NOT NULL,
    "optionSetId" TEXT NOT NULL,
    "label" TEXT NOT NULL,
    "priceDelta" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "position" INTEGER NOT NULL DEFAULT 0,

    CONSTRAINT "OptionSetEntry_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "FontAsset_shop_idx" ON "FontAsset"("shop");

-- CreateIndex
CREATE INDEX "ColorSet_shop_idx" ON "ColorSet"("shop");

-- CreateIndex
CREATE INDEX "ImageAsset_shop_idx" ON "ImageAsset"("shop");

-- CreateIndex
CREATE INDEX "OptionSet_shop_idx" ON "OptionSet"("shop");

-- AddForeignKey
ALTER TABLE "ColorSetEntry" ADD CONSTRAINT "ColorSetEntry_colorSetId_fkey" FOREIGN KEY ("colorSetId") REFERENCES "ColorSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "OptionSetEntry" ADD CONSTRAINT "OptionSetEntry_optionSetId_fkey" FOREIGN KEY ("optionSetId") REFERENCES "OptionSet"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AlterTable
ALTER TABLE "CustomizationField" ADD COLUMN     "dateFutureOnly" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "fileAccept" TEXT,
ADD COLUMN     "fontOptions" TEXT,
ADD COLUMN     "helpText" TEXT,
ADD COLUMN     "textColorOptions" TEXT;

-- AlterTable
ALTER TABLE "FieldOption" ADD COLUMN     "imageUrl" TEXT;

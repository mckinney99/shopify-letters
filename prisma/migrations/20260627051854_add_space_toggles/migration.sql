-- AlterTable
ALTER TABLE "CustomizationField" ADD COLUMN     "allowSpaces" BOOLEAN NOT NULL DEFAULT true,
ADD COLUMN     "countSpaces" BOOLEAN NOT NULL DEFAULT false;

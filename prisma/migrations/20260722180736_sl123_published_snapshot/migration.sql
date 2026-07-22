-- AlterTable
ALTER TABLE "ProductConfig" ADD COLUMN     "publishedConfig" JSONB,
ADD COLUMN     "publishedVersion" TEXT;

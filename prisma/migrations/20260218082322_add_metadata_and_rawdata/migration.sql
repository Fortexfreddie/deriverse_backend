-- AlterTable
ALTER TABLE "Fill" ADD COLUMN     "metadata" JSONB,
ADD COLUMN     "rawData" JSONB;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "metadata" JSONB;

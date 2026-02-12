-- AlterTable
ALTER TABLE "Fill" ADD COLUMN     "notes" TEXT;

-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "aiAdvice" TEXT,
ADD COLUMN     "aiBias" TEXT,
ADD COLUMN     "aiInsight" TEXT;

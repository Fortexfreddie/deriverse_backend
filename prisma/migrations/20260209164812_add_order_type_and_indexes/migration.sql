-- AlterTable
ALTER TABLE "Fill" ADD COLUMN     "orderType" TEXT;

-- CreateIndex
CREATE INDEX "Fill_positionId_idx" ON "Fill"("positionId");

-- CreateIndex
CREATE INDEX "Fill_timestamp_idx" ON "Fill"("timestamp");

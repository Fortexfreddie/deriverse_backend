-- AlterTable
ALTER TABLE "Position" ADD COLUMN     "actualExitPrice" DOUBLE PRECISION,
ADD COLUMN     "aiNextAction" TEXT,
ADD COLUMN     "aiScore" INTEGER,
ADD COLUMN     "hypotheticalExitPrice" DOUBLE PRECISION,
ADD COLUMN     "lastNudge" TEXT,
ADD COLUMN     "macroContext" TEXT,
ADD COLUMN     "marketSentiment" TEXT,
ADD COLUMN     "newsHeadlines" TEXT,
ADD COLUMN     "opportunityCost" DOUBLE PRECISION,
ADD COLUMN     "opportunityCostNote" TEXT,
ADD COLUMN     "tradeFrequency" INTEGER,
ADD COLUMN     "traderProfile" TEXT;

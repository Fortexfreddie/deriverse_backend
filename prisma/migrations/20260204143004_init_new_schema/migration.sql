-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "walletAddress" TEXT NOT NULL,
    "market" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "avgEntryPrice" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "avgExitPrice" DOUBLE PRECISION,
    "totalSize" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "realizedPnl" DOUBLE PRECISION,
    "notes" TEXT,
    "strategyUsed" TEXT,
    "rating" INTEGER,
    "emotion" TEXT,
    "aiReview" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "closedAt" TIMESTAMP(3),

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Fill" (
    "id" TEXT NOT NULL,
    "signature" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "price" DOUBLE PRECISION NOT NULL,
    "size" DOUBLE PRECISION NOT NULL,
    "fee" DOUBLE PRECISION NOT NULL,
    "isEntry" BOOLEAN NOT NULL DEFAULT true,
    "timestamp" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Fill_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "Position_walletAddress_idx" ON "Position"("walletAddress");

-- CreateIndex
CREATE UNIQUE INDEX "Fill_signature_key" ON "Fill"("signature");

-- AddForeignKey
ALTER TABLE "Fill" ADD CONSTRAINT "Fill_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

/*
  Warnings:

  - You are about to drop the `exp_trackings` table. If the table is not empty, all the data it contains will be lost.

*/
-- CreateEnum
CREATE TYPE "SessionStatus" AS ENUM ('active', 'paused', 'stopped');

-- DropForeignKey
ALTER TABLE "exp_trackings" DROP CONSTRAINT "exp_trackings_taskId_fkey";

-- DropForeignKey
ALTER TABLE "exp_trackings" DROP CONSTRAINT "exp_trackings_userId_fkey";

-- AlterTable
ALTER TABLE "tasks" ADD COLUMN     "progress" DOUBLE PRECISION NOT NULL DEFAULT 0,
ADD COLUMN     "totalTimeSpent" INTEGER NOT NULL DEFAULT 0;

-- DropTable
DROP TABLE "exp_trackings";

-- DropEnum
DROP TYPE "TrackingStatus";

-- CreateTable
CREATE TABLE "tracking_sessions" (
    "id" TEXT NOT NULL,
    "taskId" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "startTime" TIMESTAMP(3) NOT NULL,
    "endTime" TIMESTAMP(3),
    "duration" INTEGER NOT NULL DEFAULT 0,
    "status" "SessionStatus" NOT NULL DEFAULT 'active',
    "expEarned" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "tracking_sessions_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "tracking_sessions_taskId_idx" ON "tracking_sessions"("taskId");

-- CreateIndex
CREATE INDEX "tracking_sessions_userId_idx" ON "tracking_sessions"("userId");

-- CreateIndex
CREATE INDEX "tracking_sessions_taskId_status_idx" ON "tracking_sessions"("taskId", "status");

-- CreateIndex
CREATE INDEX "tracking_sessions_userId_status_idx" ON "tracking_sessions"("userId", "status");

-- AddForeignKey
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_taskId_fkey" FOREIGN KEY ("taskId") REFERENCES "tasks"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "tracking_sessions" ADD CONSTRAINT "tracking_sessions_userId_fkey" FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;

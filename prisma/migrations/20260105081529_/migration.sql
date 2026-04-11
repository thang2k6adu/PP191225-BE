/*
  Warnings:

  - A unique constraint covering the columns `[livekitRoomName]` on the table `rooms` will be added. If there are existing duplicate values, this will fail.

*/
-- AlterTable
ALTER TABLE "room_members" ADD COLUMN     "leftAt" TIMESTAMP(3),
ADD COLUMN     "readyAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "rooms" ADD COLUMN     "endedAt" TIMESTAMP(3),
ADD COLUMN     "livekitRoomName" TEXT,
ADD COLUMN     "startedAt" TIMESTAMP(3);

-- AlterTable
ALTER TABLE "tracking_sessions" ADD COLUMN     "previousProgress" DOUBLE PRECISION NOT NULL DEFAULT 0;

-- CreateIndex
CREATE UNIQUE INDEX "rooms_livekitRoomName_key" ON "rooms"("livekitRoomName");

-- CreateIndex
CREATE INDEX "rooms_livekitRoomName_idx" ON "rooms"("livekitRoomName");

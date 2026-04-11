-- CreateEnum: Add RoomVisibility enum
CREATE TYPE "RoomVisibility" AS ENUM ('PUBLIC', 'PRIVATE');

-- AlterEnum: Update RoomType enum to MATCH and PUBLIC
ALTER TYPE "RoomType" RENAME VALUE 'PRIVATE' TO 'MATCH';

-- AlterTable: Add new columns to rooms table
ALTER TABLE "rooms" ADD COLUMN "topic" TEXT;
ALTER TABLE "rooms" ADD COLUMN "visibility" "RoomVisibility" NOT NULL DEFAULT 'PUBLIC';

-- CreateIndex: Add indexes for new columns
CREATE INDEX "rooms_topic_idx" ON "rooms"("topic");
CREATE INDEX "rooms_visibility_status_idx" ON "rooms"("visibility", "status");

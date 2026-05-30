-- AlterTable
ALTER TABLE "rooms" ADD COLUMN "currentMembers" INTEGER NOT NULL DEFAULT 0;

-- Backfill from active room members (exclude LEFT status)
UPDATE "rooms" r
SET "currentMembers" = (
  SELECT COUNT(*)::INTEGER
  FROM "room_members" rm
  WHERE rm."roomId" = r.id
    AND rm.status != 'LEFT'
);

-- CreateIndex
CREATE INDEX "rooms_type_status_currentMembers_idx" ON "rooms"("type", "status", "currentMembers");

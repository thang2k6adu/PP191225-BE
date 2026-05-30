import { Prisma, Room, RoomStatus, RoomType, RoomVisibility } from '@prisma/client';
import { PrismaService } from '@/database/prisma.service';

type PrismaClientLike = PrismaService | Prisma.TransactionClient;

export interface FindAvailableRoomFilters {
  type?: RoomType;
  topic?: string | null;
  visibility?: RoomVisibility;
  status?: RoomStatus;
  minCurrentMembers?: number;
}

export async function findAvailableRoom(
  prisma: PrismaService,
  filters: FindAvailableRoomFilters,
): Promise<Room | null> {
  const conditions: Prisma.Sql[] = [Prisma.sql`"currentMembers" < "maxMembers"`];

  if (filters.type !== undefined) {
    conditions.push(Prisma.sql`type = ${filters.type}::"RoomType"`);
  }
  if (filters.topic !== undefined) {
    if (filters.topic === null) {
      conditions.push(Prisma.sql`topic IS NULL`);
    } else {
      conditions.push(Prisma.sql`topic = ${filters.topic}`);
    }
  }
  if (filters.visibility !== undefined) {
    conditions.push(Prisma.sql`visibility = ${filters.visibility}::"RoomVisibility"`);
  }
  if (filters.status !== undefined) {
    conditions.push(Prisma.sql`status = ${filters.status}::"RoomStatus"`);
  }
  if (filters.minCurrentMembers !== undefined) {
    conditions.push(Prisma.sql`"currentMembers" >= ${filters.minCurrentMembers}`);
  }

  const whereClause = Prisma.join(conditions, ' AND ');

  const rooms = await prisma.$queryRaw<Room[]>`
    SELECT *
    FROM "rooms"
    WHERE ${whereClause}
    ORDER BY "createdAt" ASC
    LIMIT 1
  `;

  return rooms[0] ?? null;
}

export async function tryIncrementRoomMembers(
  prisma: PrismaClientLike,
  roomId: string,
): Promise<boolean> {
  const updated = await prisma.$executeRaw`
    UPDATE "rooms"
    SET "currentMembers" = "currentMembers" + 1
    WHERE id = ${roomId}::uuid
      AND "currentMembers" < "maxMembers"
  `;

  return updated > 0;
}

export async function decrementRoomMembers(
  prisma: PrismaClientLike,
  roomId: string,
): Promise<void> {
  await prisma.$executeRaw`
    UPDATE "rooms"
    SET "currentMembers" = GREATEST("currentMembers" - 1, 0)
    WHERE id = ${roomId}::uuid
  `;
}

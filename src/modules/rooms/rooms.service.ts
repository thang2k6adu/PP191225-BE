import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { LiveKitService } from '@/common/services/livekit.service';
import { RoomType, RoomStatus, RoomMemberStatus, UserStatus } from '@prisma/client';

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private livekitService: LiveKitService,
  ) {}

  async joinMatchmaking(userId: string) {
    // Check if user is already in a room
    const existingMember = await this.prisma.roomMember.findFirst({
      where: {
        userId,
        status: {
          not: RoomMemberStatus.LEFT,
        },
      },
      include: {
        room: true,
      },
    });

    if (existingMember && existingMember.room.status !== RoomStatus.CLOSED) {
      throw new ConflictException('User already in a room');
    }

    // Find available room
    const availableRoom = await this.prisma.room.findFirst({
      where: {
        type: RoomType.PUBLIC,
        status: RoomStatus.WAITING,
        members: {
          some: {
            status: {
              not: RoomMemberStatus.LEFT,
            },
          },
        },
      },
      include: {
        members: {
          where: {
            status: {
              not: RoomMemberStatus.LEFT,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    let room;

    if (availableRoom && availableRoom.members.length < availableRoom.maxMembers) {
      // Join existing room
      await this.prisma.roomMember.create({
        data: {
          roomId: availableRoom.id,
          userId,
          status: RoomMemberStatus.JOINED,
        },
        include: {
          user: {
            select: {
              id: true,
              email: true,
              firstName: true,
              lastName: true,
              avatar: true,
            },
          },
        },
      });

      // Update room status if full
      const updatedMembers = await this.prisma.roomMember.count({
        where: {
          roomId: availableRoom.id,
          status: {
            not: RoomMemberStatus.LEFT,
          },
        },
      });

      if (updatedMembers >= availableRoom.maxMembers) {
        await this.prisma.room.update({
          where: { id: availableRoom.id },
          data: { status: RoomStatus.ACTIVE },
        });
      }

      room = await this.prisma.room.findUnique({
        where: { id: availableRoom.id },
        include: {
          members: {
            where: {
              status: {
                not: RoomMemberStatus.LEFT,
              },
            },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
        },
      });
    } else {
      // Create new room
      room = await this.prisma.room.create({
        data: {
          type: RoomType.PUBLIC,
          status: RoomStatus.WAITING,
          maxMembers: 2,
          members: {
            create: {
              userId,
              status: RoomMemberStatus.JOINED,
            },
          },
        },
        include: {
          members: {
            where: {
              status: {
                not: RoomMemberStatus.LEFT,
              },
            },
            include: {
              user: {
                select: {
                  id: true,
                  email: true,
                  firstName: true,
                  lastName: true,
                  avatar: true,
                },
              },
            },
          },
        },
      });
    }

    // Update user status
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.IN_ROOM },
    });

    return {
      id: room.id,
      type: room.type,
      status: room.status,
      maxMembers: room.maxMembers,
      members: room.members.map((member) => ({
        userId: member.userId,
        status: member.status,
        user: member.user,
      })),
    };
  }

  async findOne(roomId: string, userId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          where: {
            status: {
              not: RoomMemberStatus.LEFT,
            },
          },
          include: {
            user: {
              select: {
                id: true,
                email: true,
                firstName: true,
                lastName: true,
                avatar: true,
              },
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    // Check if user is a member of this room
    const isMember = room.members.some((member) => member.userId === userId);
    if (!isMember) {
      throw new ForbiddenException('You are not a member of this room');
    }

    return {
      id: room.id,
      type: room.type,
      status: room.status,
      maxMembers: room.maxMembers,
      members: room.members.map((member) => ({
        userId: member.userId,
        status: member.status,
        user: member.user,
      })),
    };
  }

  async leave(roomId: string, userId: string) {
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: {
          where: {
            status: {
              not: RoomMemberStatus.LEFT,
            },
          },
        },
      },
    });

    if (!room) {
      throw new NotFoundException('Room not found');
    }

    const member = room.members.find((m) => m.userId === userId);
    if (!member) {
      throw new ForbiddenException('You are not a member of this room');
    }

    // Update member status to LEFT
    await this.prisma.roomMember.update({
      where: { id: member.id },
      data: { status: RoomMemberStatus.LEFT },
    });

    // Check remaining members
    const remainingMembers = await this.prisma.roomMember.count({
      where: {
        roomId,
        status: {
          not: RoomMemberStatus.LEFT,
        },
      },
    });

    // If no members left, cleanup and delete room
    if (remainingMembers === 0) {
      // Cleanup LiveKit room if exists
      if (room.livekitRoomName) {
        try {
          await this.livekitService.deleteRoom(room.livekitRoomName);
        } catch (error) {
          // Log error but continue with database cleanup
          console.error(`Failed to delete LiveKit room: ${error.message}`);
        }
      }

      // Update room status to CLOSED before deleting
      await this.prisma.room.update({
        where: { id: roomId },
        data: {
          status: RoomStatus.CLOSED,
          endedAt: new Date(),
        },
      });
    } else {
      // Update room status back to WAITING if it was ACTIVE
      if (room.status === RoomStatus.ACTIVE) {
        await this.prisma.room.update({
          where: { id: roomId },
          data: { status: RoomStatus.WAITING },
        });
      }
    }

    // Update user status
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ONLINE },
    });

    return { message: 'Left room successfully' };
  }
}

import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { LiveKitService } from '@/common/services/livekit.service';
import { RoomType, RoomStatus, RoomMemberStatus, UserStatus, RoomVisibility } from '@prisma/client';
import { v4 as uuid } from 'uuid';
import { getPaginationOptions, paginate } from '@/common/utils/pagination.util';
import { PaginatedResponse } from '@/common/interfaces/api-response.interface';
import { QueryRoomsDto } from './dto/query-rooms.dto';
import {
  buildParticipantDisplayName,
  buildParticipantMetadata,
} from '@/common/utils/livekit-participant.util';
// import { PUBLIC_TOPICS, PublicTopic } from '@/config/app.config';

const livekitUserSelect = {
  id: true,
  email: true,
  firstName: true,
  lastName: true,
  avatar: true,
} as const;

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private livekitService: LiveKitService,
  ) {}

  private async findExistingActiveMember(userId: string) {
    const result = await this.prisma.roomMember.findFirst({
      where: {
        userId,
        status: {
          not: RoomMemberStatus.LEFT,
        },
        room: {
          status: {
            not: RoomStatus.CLOSED, // Only consider active rooms
          },
        },
      },
      include: {
        room: true,
      },
    });

    console.log(`🔍 findExistingActiveMember for user ${userId}:`, {
      found: !!result,
      roomId: result?.roomId,
      memberStatus: result?.status,
      roomStatus: result?.room?.status,
      roomType: result?.room?.type,
    });

    return result;
  }

  private async issueLivekitToken(
    livekitRoomName: string,
    userId: string,
    grantOptions?: {
      ttl?: number;
      canPublish?: boolean;
      canSubscribe?: boolean;
    },
  ): Promise<string> {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: livekitUserSelect,
    });

    if (!user) {
      throw new NotFoundException('User not found');
    }

    return this.livekitService.generateToken(livekitRoomName, userId, {
      ...grantOptions,
      name: buildParticipantDisplayName(user),
      metadata: buildParticipantMetadata(user),
    });
  }

  async getCurrentActiveRoom(userId: string) {
    const existingMember = await this.findExistingActiveMember(userId);

    if (!existingMember || existingMember.room.status === RoomStatus.CLOSED) {
      return { hasActiveRoom: false, room: null, token: null };
    }

    const token = await this.issueLivekitToken(existingMember.room.livekitRoomName, userId);

    return {
      hasActiveRoom: true,
      room: {
        id: existingMember.room.id,
        type: existingMember.room.type,
        topic: existingMember.room.topic,
        livekitRoomName: existingMember.room.livekitRoomName,
        status: existingMember.room.status,
      },
      token,
    };
  }

  generateRoomName(type: RoomType, topic?: string): string {
    if (type === RoomType.PUBLIC) {
      if (!topic) {
        throw new BadRequestException('Topic required for PUBLIC rooms');
      }
      return `public-${topic}`;
    } else {
      return `match-${uuid()}`;
    }
  }

  async getPublicRooms(query: QueryRoomsDto): Promise<PaginatedResponse<any>> {
    const { skip, take, page, limit } = getPaginationOptions(query.page, query.limit);

    const where = {
      type: RoomType.PUBLIC,
      visibility: RoomVisibility.PUBLIC,
    };

    const [rooms, total] = await Promise.all([
      this.prisma.room.findMany({
        where,
        include: {
          _count: {
            select: {
              members: {
                where: {
                  status: {
                    not: RoomMemberStatus.LEFT,
                  },
                },
              },
            },
          },
        },
        orderBy: {
          topic: 'asc',
        },
        skip,
        take,
      }),
      this.prisma.room.count({ where }),
    ]);

    const publicRooms = rooms.map((room) => {
      const roomWithCount = room as typeof room & {
        _count: { members: number };
      };

      return {
        id: roomWithCount.id,
        type: roomWithCount.type,
        topic: roomWithCount.topic,
        livekitRoomName: roomWithCount.livekitRoomName,
        status: roomWithCount.status,
        maxMembers: roomWithCount.maxMembers,
        currentMembers: roomWithCount._count.members,
      };
    });

    return paginate(publicRooms, total, page, limit);
  }

  async findOrCreatePublicRoom(topic: string, userId: string) {
    const existingMember = await this.findExistingActiveMember(userId);

    if (existingMember && existingMember.room.status !== RoomStatus.CLOSED) {
      const livekitToken = await this.issueLivekitToken(
        existingMember.room.livekitRoomName,
        userId,
      );

      return {
        roomId: existingMember.room.id,
        livekitRoomName: existingMember.room.livekitRoomName,
        token: livekitToken,
        topic: existingMember.room.topic,
        isNewRoom: false,
      };
    }

    // Find available public room with the same topic
    const availableRoom = await this.prisma.room.findFirst({
      where: {
        type: RoomType.PUBLIC,
        topic,
        visibility: RoomVisibility.PUBLIC,
        status: RoomStatus.ACTIVE,
      },
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

    let room;
    let isNewRoom = false;

    if (availableRoom && availableRoom.members.length < availableRoom.maxMembers) {
      // Join existing room
      const previousMember = await this.prisma.roomMember.findUnique({
        where: {
          roomId_userId: {
            roomId: availableRoom.id,
            userId,
          },
        },
      });

      if (previousMember) {
        await this.prisma.roomMember.update({
          where: { id: previousMember.id },
          data: {
            status: RoomMemberStatus.JOINED,
            leftAt: null,
          },
        });
      } else {
        await this.prisma.roomMember.create({
          data: {
            roomId: availableRoom.id,
            userId,
            status: RoomMemberStatus.JOINED,
          },
        });
      }

      room = availableRoom;
    } else {
      // Create new public room
      const roomName = this.generateRoomName(RoomType.PUBLIC, topic);

      room = await this.prisma.room.create({
        data: {
          type: RoomType.PUBLIC,
          topic,
          visibility: RoomVisibility.PUBLIC,
          status: RoomStatus.ACTIVE,
          livekitRoomName: roomName,
          maxMembers: 10, // Default max for public rooms
          startedAt: new Date(),
          members: {
            create: {
              userId,
              status: RoomMemberStatus.JOINED,
            },
          },
        },
      });

      isNewRoom = true;
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.IN_ROOM },
    });

    const livekitToken = await this.issueLivekitToken(room.livekitRoomName, userId);

    return {
      roomId: room.id,
      livekitRoomName: room.livekitRoomName,
      token: livekitToken,
      topic: room.topic,
      isNewRoom,
    };
  }

  async joinPublicRoom(roomId: string, userId: string) {
    const existingMember = await this.findExistingActiveMember(userId);

    if (existingMember && existingMember.roomId === roomId) {
      const livekitToken = await this.issueLivekitToken(
        existingMember.room.livekitRoomName,
        userId,
      );

      return {
        roomId: existingMember.room.id,
        livekitRoomName: existingMember.room.livekitRoomName,
        token: livekitToken,
        topic: existingMember.room.topic,
      };
    }

    if (existingMember && existingMember.room.status !== RoomStatus.CLOSED) {
      throw new ConflictException('User already in a room');
    }

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

    if (room.type !== RoomType.PUBLIC) {
      throw new ForbiddenException('Can only join public rooms through this endpoint');
    }

    if (room.status !== RoomStatus.ACTIVE) {
      throw new ConflictException('Room is not active');
    }

    if (room.members.length >= room.maxMembers) {
      throw new ConflictException('Room is full');
    }

    const previousMember = await this.prisma.roomMember.findUnique({
      where: {
        roomId_userId: {
          roomId: room.id,
          userId,
        },
      },
    });

    if (previousMember) {
      await this.prisma.roomMember.update({
        where: { id: previousMember.id },
        data: {
          status: RoomMemberStatus.JOINED,
          leftAt: null,
        },
      });
    } else {
      await this.prisma.roomMember.create({
        data: {
          roomId: room.id,
          userId,
          status: RoomMemberStatus.JOINED,
        },
      });
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.IN_ROOM },
    });

    const livekitToken = await this.issueLivekitToken(room.livekitRoomName, userId);

    return {
      roomId: room.id,
      livekitRoomName: room.livekitRoomName,
      token: livekitToken,
      topic: room.topic,
    };
  }

  async createMatchRoom(userIds: string[], topic?: string) {
    const roomName = this.generateRoomName(RoomType.MATCH, topic);

    const room = await this.prisma.room.create({
      data: {
        type: RoomType.MATCH,
        topic,
        visibility: RoomVisibility.PRIVATE,
        status: RoomStatus.ACTIVE,
        livekitRoomName: roomName,
        maxMembers: userIds.length,
        startedAt: new Date(),
        members: {
          create: userIds.map((userId) => ({
            userId,
            status: RoomMemberStatus.JOINED,
          })),
        },
      },
      include: {
        members: {
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

    await this.prisma.user.updateMany({
      where: {
        id: {
          in: userIds,
        },
      },
      data: {
        status: UserStatus.IN_ROOM,
      },
    });

    const tokens = await Promise.all(userIds.map((id) => this.issueLivekitToken(roomName, id)));

    return {
      roomId: room.id,
      livekitRoomName: roomName,
      tokens: userIds.map((userId, index) => ({
        userId,
        token: tokens[index],
      })),
      members: room.members,
    };
  }

  async joinMatchmaking(userId: string) {
    const existingMember = await this.findExistingActiveMember(userId);

    if (existingMember && existingMember.room.status !== RoomStatus.CLOSED) {
      throw new ConflictException('User already in a room');
    }

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
    console.log(`🚪 Leave room request: userId=${userId}, roomId=${roomId}`);

    // TODO: tối ưu cái query này hộ
    const room = await this.prisma.room.findUnique({
      where: { id: roomId },
      include: {
        members: true,
      },
    });

    if (!room) {
      console.log(`❌ Room ${roomId} not found`);
      throw new NotFoundException('Room not found');
    }

    console.log(
      `🏠 Room found: type=${room.type}, status=${room.status}, members=${room.members.length}`,
    );

    const member = room.members.find((m) => m.userId === userId);
    console.log(`👤 Member found:`, {
      found: !!member,
      memberId: member?.id,
      currentStatus: member?.status,
      leftAt: member?.leftAt,
    });

    if (!member) {
      console.log(`⚠️ Member not found, updating user status to ONLINE`);
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.ONLINE },
      });
      return { message: 'Left room successfully' };
    }

    if (member.status === RoomMemberStatus.LEFT) {
      console.log(`⚠️ Member already LEFT, updating user status to ONLINE`);
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.ONLINE },
      });
      return { message: 'Left room successfully' };
    }

    console.log(`✅ Updating member status to LEFT`);
    await this.prisma.roomMember.update({
      where: { id: member.id },
      data: {
        status: RoomMemberStatus.LEFT,
        leftAt: new Date(),
      },
    });

    const remainingMembers = await this.prisma.roomMember.count({
      where: {
        roomId,
        status: {
          not: RoomMemberStatus.LEFT,
        },
      },
    });

    console.log(`👥 Remaining members: ${remainingMembers}`);

    // Close MATCH room if no remaining members OR if it's a match room with only 1 person left
    if (remainingMembers === 0 || (room.type === RoomType.MATCH && remainingMembers <= 1)) {
      if (room.type === RoomType.MATCH) {
        console.log(`🔒 Closing MATCH room ${roomId}`);
        if (room.livekitRoomName) {
          try {
            await this.livekitService.deleteRoom(room.livekitRoomName);
            console.log(`✅ LiveKit room ${room.livekitRoomName} deleted`);
          } catch (error) {
            const errorMessage = error instanceof Error ? error.message : String(error);
            console.error(`Failed to delete LiveKit room: ${errorMessage}`);
          }
        }

        await this.prisma.room.update({
          where: { id: roomId },
          data: {
            status: RoomStatus.CLOSED,
            endedAt: new Date(),
          },
        });
        console.log(`✅ Room ${roomId} status updated to CLOSED`);
      }
    }

    console.log(`👤 Updating user ${userId} status to ONLINE`);
    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ONLINE },
    });

    console.log(`✅ Leave room completed successfully`);
    return { message: 'Left room successfully' };
  }
}

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
// import { PUBLIC_TOPICS, PublicTopic } from '@/config/app.config';

@Injectable()
export class RoomsService {
  constructor(
    private prisma: PrismaService,
    private livekitService: LiveKitService,
  ) {}

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

  async getPublicRooms() {
    const rooms = await this.prisma.room.findMany({
      where: {
        type: RoomType.PUBLIC,
        visibility: RoomVisibility.PUBLIC,
      },
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
    });

    return rooms.map((room) => ({
      id: room.id,
      type: room.type,
      topic: room.topic,
      livekitRoomName: room.livekitRoomName,
      status: room.status,
      maxMembers: room.maxMembers,
      currentMembers: room._count.members,
    }));
  }

  async findOrCreatePublicRoom(topic: string, userId: string) {
    // Check if user already in a room
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
      const livekitToken = await this.livekitService.generateToken(
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

    const livekitToken = await this.livekitService.generateToken(room.livekitRoomName, userId);

    return {
      roomId: room.id,
      livekitRoomName: room.livekitRoomName,
      token: livekitToken,
      topic: room.topic,
      isNewRoom,
    };
  }

  async joinPublicRoom(roomId: string, userId: string) {
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

    if (existingMember && existingMember.roomId === roomId) {
      const livekitToken = await this.livekitService.generateToken(
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

    const livekitToken = await this.livekitService.generateToken(room.livekitRoomName, userId);

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

    const tokens = await Promise.all(
      userIds.map((userId) => this.livekitService.generateToken(roomName, userId)),
    );

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
      await this.prisma.user.update({
        where: { id: userId },
        data: { status: UserStatus.ONLINE },
      });
      return { message: 'Left room successfully' };
    }

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

    if (remainingMembers === 0) {
      if (room.type === RoomType.MATCH) {
        if (room.livekitRoomName) {
          try {
            await this.livekitService.deleteRoom(room.livekitRoomName);
          } catch (error) {
            console.error(`Failed to delete LiveKit room: ${error.message}`);
          }
        }

        await this.prisma.room.update({
          where: { id: roomId },
          data: {
            status: RoomStatus.CLOSED,
            endedAt: new Date(),
          },
        });
      }
    }

    await this.prisma.user.update({
      where: { id: userId },
      data: { status: UserStatus.ONLINE },
    });

    return { message: 'Left room successfully' };
  }
}

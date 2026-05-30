import { Test, TestingModule } from '@nestjs/testing';
import { RoomsService } from './rooms.service';
import { PrismaService } from '@/database/prisma.service';
import { LiveKitService } from '@/common/services/livekit.service';
import { NotFoundException, ConflictException, ForbiddenException } from '@nestjs/common';
import { RoomType, RoomStatus, RoomMemberStatus, UserStatus } from '@prisma/client';

describe('RoomsService', () => {
  let service: RoomsService;

  const mockPrismaService = {
    roomMember: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      count: jest.fn(),
    },
    room: {
      findFirst: jest.fn(),
      findUnique: jest.fn(),
      findUniqueOrThrow: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
    },
    user: {
      update: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $executeRaw: jest.fn(),
    $transaction: jest.fn(),
  };

  const mockLiveKitService = {
    generateToken: jest.fn(),
    deleteRoom: jest.fn(),
  };

  beforeEach(async () => {
    mockPrismaService.$transaction.mockImplementation(async (callback) =>
      callback(mockPrismaService),
    );

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        RoomsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
        {
          provide: LiveKitService,
          useValue: mockLiveKitService,
        },
      ],
    }).compile();

    service = module.get<RoomsService>(RoomsService);
    jest.clearAllMocks();
    mockPrismaService.$transaction.mockImplementation(async (callback) =>
      callback(mockPrismaService),
    );
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('joinMatchmaking', () => {
    it('should throw ConflictException if user is already in a room', async () => {
      const userId = 'user-id';
      mockPrismaService.roomMember.findFirst.mockResolvedValue({
        userId,
        room: {
          id: 'room-id',
          status: RoomStatus.WAITING,
        },
      });

      await expect(service.joinMatchmaking(userId)).rejects.toThrow(ConflictException);
    });

    it('should join existing available room', async () => {
      const userId = 'user-id';
      const existingRoom = {
        id: 'room-id',
        type: RoomType.PUBLIC,
        status: RoomStatus.WAITING,
        maxMembers: 2,
        currentMembers: 1,
        members: [
          {
            userId: 'other-user-id',
            status: RoomMemberStatus.JOINED,
            user: {
              id: 'other-user-id',
              email: 'other@example.com',
            },
          },
        ],
      };

      mockPrismaService.roomMember.findFirst.mockResolvedValue(null);
      mockPrismaService.$queryRaw.mockResolvedValue([existingRoom]);
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockPrismaService.roomMember.create.mockResolvedValue({
        id: 'member-id',
        roomId: 'room-id',
        userId,
        status: RoomMemberStatus.JOINED,
      });
      mockPrismaService.room.findUniqueOrThrow.mockResolvedValue({
        ...existingRoom,
        currentMembers: 2,
      });
      mockPrismaService.room.update.mockResolvedValue({
        ...existingRoom,
        status: RoomStatus.ACTIVE,
      });
      mockPrismaService.room.findUnique.mockResolvedValue({
        ...existingRoom,
        status: RoomStatus.ACTIVE,
        members: [
          ...existingRoom.members,
          {
            userId,
            status: RoomMemberStatus.JOINED,
            user: {
              id: userId,
              email: 'user@example.com',
            },
          },
        ],
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.joinMatchmaking(userId);

      expect(result).toHaveProperty('id', 'room-id');
      expect(result.status).toBe(RoomStatus.ACTIVE);
      expect(mockPrismaService.roomMember.create).toHaveBeenCalled();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { status: UserStatus.IN_ROOM },
      });
    });

    it('should create new room if no available room exists', async () => {
      const userId = 'user-id';
      const newRoom = {
        id: 'new-room-id',
        type: RoomType.PUBLIC,
        status: RoomStatus.WAITING,
        maxMembers: 2,
        currentMembers: 1,
        members: [
          {
            userId,
            status: RoomMemberStatus.JOINED,
            user: {
              id: userId,
              email: 'user@example.com',
            },
          },
        ],
      };

      mockPrismaService.roomMember.findFirst.mockResolvedValue(null);
      mockPrismaService.$queryRaw.mockResolvedValue([]);
      mockPrismaService.room.create.mockResolvedValue(newRoom);
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.joinMatchmaking(userId);

      expect(result).toHaveProperty('id', 'new-room-id');
      expect(result.status).toBe(RoomStatus.WAITING);
      expect(mockPrismaService.room.create).toHaveBeenCalled();
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { status: UserStatus.IN_ROOM },
      });
    });
  });

  describe('findOne', () => {
    it('should return room information', async () => {
      const roomId = 'room-id';
      const userId = 'user-id';
      const room = {
        id: roomId,
        type: RoomType.PUBLIC,
        status: RoomStatus.ACTIVE,
        maxMembers: 2,
        members: [
          {
            userId,
            status: RoomMemberStatus.JOINED,
            user: {
              id: userId,
              email: 'user@example.com',
            },
          },
        ],
      };

      mockPrismaService.room.findUnique.mockResolvedValue(room);

      const result = await service.findOne(roomId, userId);

      expect(result).toHaveProperty('id', roomId);
      expect(result.members).toHaveLength(1);
    });

    it('should throw NotFoundException if room not found', async () => {
      const roomId = 'non-existent-id';
      const userId = 'user-id';

      mockPrismaService.room.findUnique.mockResolvedValue(null);

      await expect(service.findOne(roomId, userId)).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user is not a member', async () => {
      const roomId = 'room-id';
      const userId = 'user-id';
      const room = {
        id: roomId,
        members: [
          {
            userId: 'other-user-id',
            status: RoomMemberStatus.JOINED,
          },
        ],
      };

      mockPrismaService.room.findUnique.mockResolvedValue(room);

      await expect(service.findOne(roomId, userId)).rejects.toThrow(ForbiddenException);
    });
  });

  describe('leave', () => {
    it('should leave room successfully', async () => {
      const roomId = 'room-id';
      const userId = 'user-id';
      const room = {
        id: roomId,
        type: RoomType.PUBLIC,
        status: RoomStatus.ACTIVE,
        currentMembers: 2,
        members: [
          {
            id: 'member-id',
            userId,
            status: RoomMemberStatus.JOINED,
          },
          {
            id: 'other-member-id',
            userId: 'other-user-id',
            status: RoomMemberStatus.JOINED,
          },
        ],
      };

      mockPrismaService.room.findUnique.mockResolvedValue(room);
      mockPrismaService.roomMember.update.mockResolvedValue({});
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockPrismaService.room.findUniqueOrThrow.mockResolvedValue({
        currentMembers: 1,
        type: RoomType.PUBLIC,
      });
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.leave(roomId, userId);

      expect(result).toHaveProperty('message', 'Left room successfully');
      expect(mockPrismaService.roomMember.update).toHaveBeenCalledWith({
        where: { id: 'member-id' },
        data: {
          status: RoomMemberStatus.LEFT,
          leftAt: expect.any(Date),
        },
      });
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { status: UserStatus.ONLINE },
      });
    });

    it('should close MATCH room when one member remains', async () => {
      const roomId = 'room-id';
      const userId = 'user-id';
      const room = {
        id: roomId,
        type: RoomType.MATCH,
        status: RoomStatus.ACTIVE,
        livekitRoomName: 'match-room',
        currentMembers: 2,
        members: [
          {
            id: 'member-id',
            userId,
            status: RoomMemberStatus.JOINED,
          },
          {
            id: 'other-member-id',
            userId: 'other-user-id',
            status: RoomMemberStatus.JOINED,
          },
        ],
      };

      mockPrismaService.room.findUnique.mockResolvedValue(room);
      mockPrismaService.roomMember.update.mockResolvedValue({});
      mockPrismaService.$executeRaw.mockResolvedValue(1);
      mockPrismaService.room.findUniqueOrThrow.mockResolvedValue({
        currentMembers: 1,
        type: RoomType.MATCH,
      });
      mockPrismaService.room.update.mockResolvedValue({});
      mockPrismaService.user.update.mockResolvedValue({});
      mockLiveKitService.deleteRoom.mockResolvedValue(undefined);

      await service.leave(roomId, userId);

      expect(mockPrismaService.room.update).toHaveBeenCalledWith({
        where: { id: roomId },
        data: {
          status: RoomStatus.CLOSED,
          endedAt: expect.any(Date),
        },
      });
    });

    it('should throw NotFoundException if room not found', async () => {
      const roomId = 'non-existent-id';
      const userId = 'user-id';

      mockPrismaService.room.findUnique.mockResolvedValue(null);

      await expect(service.leave(roomId, userId)).rejects.toThrow(NotFoundException);
    });

    it('should update user status when user is not a member', async () => {
      const roomId = 'room-id';
      const userId = 'user-id';
      const room = {
        id: roomId,
        members: [
          {
            userId: 'other-user-id',
            status: RoomMemberStatus.JOINED,
          },
        ],
      };

      mockPrismaService.room.findUnique.mockResolvedValue(room);
      mockPrismaService.user.update.mockResolvedValue({});

      const result = await service.leave(roomId, userId);

      expect(result).toHaveProperty('message', 'Left room successfully');
      expect(mockPrismaService.user.update).toHaveBeenCalledWith({
        where: { id: userId },
        data: { status: UserStatus.ONLINE },
      });
    });
  });
});

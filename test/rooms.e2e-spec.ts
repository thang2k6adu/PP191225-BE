import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';
import { RoomType, RoomStatus, RoomMemberStatus, UserStatus } from '@prisma/client';

describe('RoomsController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken1: string;
  let accessToken2: string;
  let userId1: string;
  let userId2: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    app.setGlobalPrefix('api');
    app.useGlobalPipes(new ValidationPipe({ transform: true }));
    await app.init();

    prisma = app.get<PrismaService>(PrismaService);

    // Clean up test data
    try {
      const existingUsers = await prisma.user.findMany({
        where: {
          email: {
            in: ['test-rooms-1@example.com', 'test-rooms-2@example.com'],
          },
        },
      });

      for (const user of existingUsers) {
        await prisma.roomMember.deleteMany({
          where: { userId: user.id },
        });
      }

      await prisma.room.deleteMany({
        where: {
          members: {
            some: {
              user: {
                email: {
                  in: ['test-rooms-1@example.com', 'test-rooms-2@example.com'],
                },
              },
            },
          },
        },
      });

      await prisma.user.deleteMany({
        where: {
          email: {
            in: ['test-rooms-1@example.com', 'test-rooms-2@example.com'],
          },
        },
      });
    } catch (error: any) {
      console.warn('Could not cleanup initial test data:', error.message);
    }

    // Create test users and get tokens
    const registerResponse1 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'test-rooms-1@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User1',
      })
      .expect(201);

    expect(registerResponse1.body.data).toBeDefined();
    accessToken1 = registerResponse1.body.data.accessToken;

    // Get userId from database
    const user1 = await prisma.user.findUnique({
      where: { email: 'test-rooms-1@example.com' },
      select: { id: true },
    });
    userId1 = user1?.id || '';

    if (!userId1 || !accessToken1) {
      throw new Error('Failed to register user 1');
    }

    const registerResponse2 = await request(app.getHttpServer())
      .post('/api/auth/register')
      .send({
        email: 'test-rooms-2@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User2',
      })
      .expect(201);

    expect(registerResponse2.body.data).toBeDefined();
    accessToken2 = registerResponse2.body.data.accessToken;

    // Get userId from database
    const user2 = await prisma.user.findUnique({
      where: { email: 'test-rooms-2@example.com' },
      select: { id: true },
    });
    userId2 = user2?.id || '';

    if (!userId2 || !accessToken2) {
      throw new Error('Failed to register user 2');
    }
  });

  afterAll(async () => {
    // Clean up test data
    try {
      // First, delete room members
      const existingUsers = await prisma.user.findMany({
        where: {
          email: {
            in: [
              'test-rooms-1@example.com',
              'test-rooms-2@example.com',
              'test-rooms-3@example.com',
              'test-rooms-4@example.com',
            ],
          },
        },
        select: { id: true },
      });

      if (existingUsers.length > 0) {
        const userIds = existingUsers.map((u) => u.id);
        await prisma.roomMember.deleteMany({
          where: { userId: { in: userIds } },
        });

        // Delete rooms that have no members left
        await prisma.room.deleteMany({
          where: {
            members: {
              none: {},
            },
          },
        });
      }

      await prisma.user.deleteMany({
        where: {
          email: {
            in: [
              'test-rooms-1@example.com',
              'test-rooms-2@example.com',
              'test-rooms-3@example.com',
              'test-rooms-4@example.com',
            ],
          },
        },
      });
    } catch (error: any) {
      console.warn('Could not cleanup final test data:', error.message);
    }

    // Close app first
    if (app) {
      await app.close();
    }

    // Close Prisma connection
    if (prisma) {
      await prisma.$disconnect();
    }
  });

  describe('POST /api/rooms/matchmaking/join', () => {
    it('should create a new room when no available room exists', async () => {
      const response = await request(app.getHttpServer())
        .post('/api/rooms/matchmaking/join')
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(200);

      expect(response.body).toHaveProperty('error', false);
      expect(response.body.data).toHaveProperty('room');
      expect(response.body.data.room).toHaveProperty('id');
      expect(response.body.data.room.type).toBe(RoomType.PUBLIC);
      expect(response.body.data.room.status).toBe(RoomStatus.WAITING);
      expect(response.body.data.room.maxMembers).toBe(2);
      expect(response.body.data.room.members).toBeInstanceOf(Array);
      expect(response.body.data.room.members.length).toBe(1);
    });

    it('should join existing room when available', async () => {
      // User 1 already created a room, now user 2 joins
      const response = await request(app.getHttpServer())
        .post('/api/rooms/matchmaking/join')
        .set('Authorization', `Bearer ${accessToken2}`)
        .expect(200);

      expect(response.body).toHaveProperty('error', false);
      expect(response.body.data.room).toHaveProperty('id');
      expect(response.body.data.room.members.length).toBe(2);
      expect(response.body.data.room.status).toBe(RoomStatus.ACTIVE);
    });

    it('should return 409 if user is already in a room', async () => {
      await request(app.getHttpServer())
        .post('/api/rooms/matchmaking/join')
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(409);
    });

    it('should return 401 if not authenticated', async () => {
      await request(app.getHttpServer()).post('/api/rooms/matchmaking/join').expect(401);
    });
  });

  describe('GET /api/rooms/:roomId', () => {
    let roomId: string;

    beforeAll(async () => {
      if (!userId1) {
        throw new Error('userId1 is not defined');
      }

      // Ensure user 1 is in a room
      const user1 = await prisma.user.findUnique({
        where: { id: userId1 },
        include: {
          roomMembers: {
            where: {
              status: {
                not: RoomMemberStatus.LEFT,
              },
            },
            include: {
              room: true,
            },
          },
        },
      });

      if (user1 && user1.roomMembers.length > 0) {
        roomId = user1.roomMembers[0].roomId;
      } else {
        // Create a room for user 1
        const room = await prisma.room.create({
          data: {
            type: RoomType.PUBLIC,
            status: RoomStatus.WAITING,
            maxMembers: 2,
            members: {
              create: {
                userId: userId1,
                status: RoomMemberStatus.JOINED,
              },
            },
          },
        });
        roomId = room.id;
      }
    });

    it('should return room information', async () => {
      const response = await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(200);

      expect(response.body).toHaveProperty('error', false);
      expect(response.body.data).toHaveProperty('id', roomId);
      expect(response.body.data).toHaveProperty('type');
      expect(response.body.data).toHaveProperty('status');
      expect(response.body.data).toHaveProperty('members');
      expect(response.body.data.members).toBeInstanceOf(Array);
    });

    it('should return 404 if room not found', async () => {
      await request(app.getHttpServer())
        .get('/api/rooms/non-existent-id')
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(404);
    });

    it('should return 403 if user is not a member', async () => {
      // Create another user and room
      const registerResponse = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'test-rooms-3@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User3',
      });

      const otherAccessToken = registerResponse.body.data.accessToken;

      await request(app.getHttpServer())
        .get(`/api/rooms/${roomId}`)
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .expect(403);
    });
  });

  describe('POST /api/rooms/:roomId/leave', () => {
    let roomId: string;

    beforeEach(async () => {
      if (!userId1) {
        throw new Error('userId1 is not defined');
      }

      // Clean up any existing rooms for user1 first
      await prisma.roomMember.deleteMany({
        where: { userId: userId1 },
      });

      // Create a room for user 1
      const room = await prisma.room.create({
        data: {
          type: RoomType.PUBLIC,
          status: RoomStatus.WAITING,
          maxMembers: 2,
          members: {
            create: {
              userId: userId1,
              status: RoomMemberStatus.JOINED,
            },
          },
        },
      });
      roomId = room.id;

      // Update user status
      await prisma.user.update({
        where: { id: userId1 },
        data: { status: UserStatus.IN_ROOM },
      });
    });

    afterEach(async () => {
      // Clean up room after each test
      if (roomId) {
        try {
          await prisma.roomMember.deleteMany({
            where: { roomId },
          });
          await prisma.room.deleteMany({
            where: { id: roomId },
          });
        } catch (error) {
          // Ignore cleanup errors
        }
      }
    });

    it('should leave room successfully', async () => {
      const response = await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/leave`)
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(200);

      expect(response.body).toHaveProperty('error', false);
      expect(response.body.message).toBe('Success');
      expect(response.body.data).toHaveProperty('message', 'Left room successfully');

      // Verify room is deleted if empty
      const room = await prisma.room.findUnique({
        where: { id: roomId },
      });
      expect(room).toBeNull();
    });

    it('should return 404 if room not found', async () => {
      await request(app.getHttpServer())
        .post('/api/rooms/non-existent-id/leave')
        .set('Authorization', `Bearer ${accessToken1}`)
        .expect(404);
    });

    it('should return 403 if user is not a member', async () => {
      // Create another user
      const registerResponse = await request(app.getHttpServer()).post('/api/auth/register').send({
        email: 'test-rooms-4@example.com',
        password: 'password123',
        firstName: 'Test',
        lastName: 'User4',
      });

      const otherAccessToken = registerResponse.body.data.accessToken;

      await request(app.getHttpServer())
        .post(`/api/rooms/${roomId}/leave`)
        .set('Authorization', `Bearer ${otherAccessToken}`)
        .expect(403);
    });
  });
});

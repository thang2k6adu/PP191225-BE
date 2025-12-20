import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('ExpController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;
  let taskId: string;

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
      const existingUser = await prisma.user.findUnique({
        where: { email: 'test-exp@example.com' },
        select: { id: true },
      });

      if (existingUser) {
        await prisma.expTracking.deleteMany({
          where: {
            userId: existingUser.id,
          },
        });
        await prisma.task.deleteMany({
          where: {
            userId: existingUser.id,
          },
        });
        await prisma.user.delete({
          where: { email: 'test-exp@example.com' },
        });
      }
    } catch (error) {
      // Ignore if tables don't exist
    }

    // Create test user and get token
    const registerResponse = await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'test-exp@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
    });

    // If user already exists, login instead
    if (registerResponse.status === 409 || !registerResponse.body.data?.accessToken) {
      const loginResponse = await request(app.getHttpServer()).post('/api/auth/login').send({
        email: 'test-exp@example.com',
        password: 'password123',
      });
      accessToken = loginResponse.body.data.accessToken;
    } else {
      accessToken = registerResponse.body.data.accessToken;
    }

    // Get userId from database
    const user = await prisma.user.findUnique({
      where: { email: 'test-exp@example.com' },
      select: { id: true },
    });
    userId = user?.id || '';

    // Ensure we have accessToken
    if (!accessToken) {
      throw new Error('Failed to get access token for e2e test');
    }

    // Create a test task
    const taskResponse = await request(app.getHttpServer())
      .post('/api/tasks')
      .set('Authorization', `Bearer ${accessToken}`)
      .send({
        name: 'Test Task for EXP',
        estimateHours: 4, // 4 hours = 240 minutes
        deadline: '2025-12-31',
      });

    taskId = taskResponse.body.data.id;
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await prisma.expTracking.deleteMany({
        where: {
          userId,
        },
      });
      await prisma.task.deleteMany({
        where: {
          userId,
        },
      });
      await prisma.user.deleteMany({
        where: {
          email: 'test-exp@example.com',
        },
      });
    } catch (error) {
      // Ignore
    }
    await app.close();
  });

  describe('POST /api/exp/start', () => {
    it('should start tracking a task', () => {
      return request(app.getHttpServer())
        .post('/api/exp/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', false);
          expect(res.body.data).toHaveProperty('trackingId');
          expect(res.body.data.status).toBe('active');
          expect(res.body.data).toHaveProperty('startTime');
          expect(res.body.data.accumulatedTime).toBe(0);
        });
    });

    it('should return 400 if task is already being tracked', () => {
      return request(app.getHttpServer())
        .post('/api/exp/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId,
        })
        .expect(400);
    });

    it('should return 400 if validation fails', () => {
      return request(app.getHttpServer())
        .post('/api/exp/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId: 'invalid-uuid',
        })
        .expect(400);
    });

    it('should return 404 if task not found', () => {
      return request(app.getHttpServer())
        .post('/api/exp/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId: '00000000-0000-0000-0000-000000000000',
        })
        .expect(404);
    });
  });

  describe('GET /api/exp/progress/:taskId', () => {
    it('should get progress for active tracking', () => {
      return request(app.getHttpServer())
        .get(`/api/exp/progress/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', false);
          expect(res.body.data).toHaveProperty('trackingId');
          expect(res.body.data).toHaveProperty('status');
          expect(res.body.data).toHaveProperty('accumulatedTime');
          expect(res.body.data).toHaveProperty('percentComplete');
          expect(res.body.data).toHaveProperty('expEarned');
        });
    });

    it('should return 404 if tracking not found', () => {
      // Create a new task without tracking
      return request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Untracked Task',
          estimateHours: 2,
          deadline: '2025-12-31',
        })
        .then((res) => {
          const untrackedTaskId = res.body.data.id;
          return request(app.getHttpServer())
            .get(`/api/exp/progress/${untrackedTaskId}`)
            .set('Authorization', `Bearer ${accessToken}`)
            .expect(404);
        });
    });
  });

  describe('POST /api/exp/pause', () => {
    it('should pause tracking a task', async () => {
      // Wait a bit to accumulate some time
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return request(app.getHttpServer())
        .post('/api/exp/pause')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', false);
          expect(res.body.data).toHaveProperty('trackingId');
          expect(res.body.data.status).toBe('paused');
          expect(res.body.data.accumulatedTime).toBeGreaterThan(0);
        });
    });

    it('should return 400 if no active tracking found', () => {
      return request(app.getHttpServer())
        .post('/api/exp/pause')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId,
        })
        .expect(400);
    });
  });

  describe('POST /api/exp/resume', () => {
    it('should resume tracking a task', () => {
      return request(app.getHttpServer())
        .post('/api/exp/resume')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', false);
          expect(res.body.data).toHaveProperty('trackingId');
          expect(res.body.data.status).toBe('active');
          expect(res.body.data).toHaveProperty('startTime');
          expect(res.body.data.accumulatedTime).toBeGreaterThan(0);
        });
    });

    it('should return 400 if task is already active', () => {
      return request(app.getHttpServer())
        .post('/api/exp/resume')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId,
        })
        .expect(400);
    });
  });

  describe('POST /api/exp/stop', () => {
    it('should stop tracking and calculate EXP', async () => {
      // Wait a bit to accumulate some time
      await new Promise((resolve) => setTimeout(resolve, 1000));

      return request(app.getHttpServer())
        .post('/api/exp/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', false);
          expect(res.body.data).toHaveProperty('trackingId');
          expect(res.body.data.status).toBe('stopped');
          expect(res.body.data.accumulatedTime).toBeGreaterThan(0);
          expect(res.body.data).toHaveProperty('percentComplete');
          expect(res.body.data).toHaveProperty('expEarned');
          expect(res.body.data.expEarned).toBeGreaterThanOrEqual(0);
        });
    });

    it('should return 400 if task is already stopped', () => {
      return request(app.getHttpServer())
        .post('/api/exp/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId,
        })
        .expect(400);
    });
  });

  describe('Full flow: Start -> Pause -> Resume -> Stop', () => {
    let newTaskId: string;

    beforeAll(async () => {
      // Create a new task for full flow test
      const taskResponse = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Full Flow Test Task',
          estimateHours: 2, // 2 hours = 120 minutes
          deadline: '2025-12-31',
        });

      newTaskId = taskResponse.body.data.id;
    });

    it('should complete full tracking flow', async () => {
      // Start tracking
      const startResponse = await request(app.getHttpServer())
        .post('/api/exp/start')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId: newTaskId,
        })
        .expect(200);

      expect(startResponse.body.data.status).toBe('active');

      // Wait a bit
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Pause
      const pauseResponse = await request(app.getHttpServer())
        .post('/api/exp/pause')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId: newTaskId,
        })
        .expect(200);

      expect(pauseResponse.body.data.status).toBe('paused');
      expect(pauseResponse.body.data.accumulatedTime).toBeGreaterThan(0);

      // Resume
      await new Promise((resolve) => setTimeout(resolve, 500));

      const resumeResponse = await request(app.getHttpServer())
        .post('/api/exp/resume')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId: newTaskId,
        })
        .expect(200);

      expect(resumeResponse.body.data.status).toBe('active');

      // Wait a bit more
      await new Promise((resolve) => setTimeout(resolve, 1000));

      // Stop and calculate EXP
      const stopResponse = await request(app.getHttpServer())
        .post('/api/exp/stop')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          taskId: newTaskId,
        })
        .expect(200);

      expect(stopResponse.body.data.status).toBe('stopped');
      expect(stopResponse.body.data.accumulatedTime).toBeGreaterThan(0);
      expect(stopResponse.body.data.percentComplete).toBeGreaterThan(0);
      expect(stopResponse.body.data.expEarned).toBeGreaterThan(0);
    });
  });
});

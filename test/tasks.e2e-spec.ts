import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication, ValidationPipe } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from '../src/app.module';
import { PrismaService } from '../src/database/prisma.service';

describe('TasksController (e2e)', () => {
  let app: INestApplication;
  let prisma: PrismaService;
  let accessToken: string;
  let userId: string;

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
        where: { email: 'test-tasks@example.com' },
        select: { id: true },
      });

      if (existingUser) {
        await prisma.task.deleteMany({
          where: {
            userId: existingUser.id,
          },
        });
        await prisma.user.delete({
          where: { email: 'test-tasks@example.com' },
        });
      }
    } catch (error) {
      // Ignore if tables don't exist
    }

    // Create test user and get token
    const registerResponse = await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'test-tasks@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
    });

    accessToken = registerResponse.body.data.accessToken;

    // Get userId from database
    const user = await prisma.user.findUnique({
      where: { email: 'test-tasks@example.com' },
      select: { id: true },
    });
    userId = user?.id || '';

    // If no token, login instead
    if (!accessToken) {
      const loginResponse = await request(app.getHttpServer()).post('/api/auth/login').send({
        email: 'test-tasks@example.com',
        password: 'password123',
      });

      accessToken = loginResponse.body.data.accessToken;
    }
  });

  afterAll(async () => {
    // Clean up test data
    try {
      await prisma.task.deleteMany({
        where: {
          userId,
        },
      });
      await prisma.user.deleteMany({
        where: {
          email: 'test-tasks@example.com',
        },
      });
    } catch (error) {
      // Ignore
    }
    await app.close();
  });

  describe('POST /api/tasks', () => {
    it('should create a task with PLANNED status', () => {
      return request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Build authentication module',
          estimateHours: 6,
          deadline: '2025-12-30',
        })
        .expect(201)
        .expect((res) => {
          expect(res.body).toHaveProperty('error', false);
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data.name).toBe('Build authentication module');
          expect(Number(res.body.data.estimateHours)).toBe(6);
          expect(res.body.data.status).toBe('PLANNED');
          expect(res.body.data.isActive).toBe(false);
        });
    });

    it('should return 400 if validation fails', () => {
      return request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '', // Invalid: empty name
          estimateHours: -10, // Invalid: negative
        })
        .expect(400);
    });
  });

  describe('GET /api/tasks', () => {
    it('should return paginated tasks', () => {
      return request(app.getHttpServer())
        .get('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('items');
          expect(res.body.data).toHaveProperty('meta');
          expect(res.body.data.meta).toHaveProperty('totalItems');
          expect(res.body.data.meta).toHaveProperty('currentPage');
        });
    });

    it('should filter tasks by status', () => {
      return request(app.getHttpServer())
        .get('/api/tasks?status=PLANNED')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.items).toBeInstanceOf(Array);
          if (res.body.data.items.length > 0) {
            expect(res.body.data.items[0].status).toBe('PLANNED');
          }
        });
    });
  });

  describe('GET /api/tasks/active', () => {
    it('should return null if no active task', () => {
      return request(app.getHttpServer())
        .get('/api/tasks/active')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toBeNull();
        });
    });
  });

  describe('POST /api/tasks/:id/activate', () => {
    let taskId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Task to activate',
          estimateHours: 4,
          deadline: '2025-12-31',
        });

      taskId = createResponse.body.data.id;
    });

    it('should activate a task', () => {
      return request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(200)
        .expect((res) => {
          expect(res.body.data.status).toBe('ACTIVE');
          expect(res.body.data.isActive).toBe(true);
        });
    });

    it('should deactivate previous active task when activating new one', async () => {
      // Create another task
      const createResponse = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Another task',
          estimateHours: 2,
          deadline: '2025-12-31',
        });

      const newTaskId = createResponse.body.data.id;

      // Activate new task
      await request(app.getHttpServer())
        .post(`/api/tasks/${newTaskId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(200);

      // Check that previous task is deactivated
      const previousTaskResponse = await request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200);

      expect(previousTaskResponse.body.data.isActive).toBe(false);
      expect(previousTaskResponse.body.data.status).toBe('PLANNED');
    });
  });

  describe('GET /api/tasks/active (after activation)', () => {
    it('should return active task', () => {
      return request(app.getHttpServer())
        .get('/api/tasks/active')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data).not.toBeNull();
          expect(res.body.data.status).toBe('ACTIVE');
          expect(res.body.data.isActive).toBe(true);
        });
    });
  });

  describe('POST /api/tasks/:id/complete', () => {
    let taskId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Task to complete',
          estimateHours: 3,
          deadline: '2025-12-31',
        });

      taskId = createResponse.body.data.id;
    });

    it('should complete a task', () => {
      return request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/complete`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(200)
        .expect((res) => {
          expect(res.body.data.status).toBe('DONE');
          expect(res.body.data.isActive).toBe(false);
        });
    });

    it('should return 400 if trying to activate completed task', async () => {
      await request(app.getHttpServer())
        .post(`/api/tasks/${taskId}/activate`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({})
        .expect(400);
    });
  });

  describe('GET /api/tasks/:id', () => {
    let taskId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Get Test Task',
          estimateHours: 5,
          deadline: '2025-12-31',
        });

      taskId = createResponse.body.data.id;
    });

    it('should return a task by ID', () => {
      return request(app.getHttpServer())
        .get(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.id).toBe(taskId);
          expect(res.body.data.name).toBe('Get Test Task');
        });
    });

    it('should return 404 if task not found', () => {
      return request(app.getHttpServer())
        .get('/api/tasks/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('PATCH /api/tasks/:id', () => {
    let taskId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Update Test Task',
          estimateHours: 4,
          deadline: '2025-12-31',
        });

      taskId = createResponse.body.data.id;
    });

    it('should update a task', () => {
      return request(app.getHttpServer())
        .patch(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Task Name',
          estimateHours: 8,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.name).toBe('Updated Task Name');
          expect(Number(res.body.data.estimateHours)).toBe(8);
        });
    });
  });

  describe('DELETE /api/tasks/:id', () => {
    let taskId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/tasks')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Delete Test Task',
          estimateHours: 2,
          deadline: '2025-12-31',
        });

      taskId = createResponse.body.data.id;
    });

    it('should delete a task', () => {
      return request(app.getHttpServer())
        .delete(`/api/tasks/${taskId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.message).toBe('Task deleted successfully');
        });
    });
  });
});

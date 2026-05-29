import { Test, TestingModule } from '@nestjs/testing';
import { TasksService } from './tasks.service';
import { PrismaService } from '@/database/prisma.service';
import { TrackingService } from '../tracking/tracking.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TaskStatus } from '@prisma/client';
import { CacheService } from '@/common/services/cache.service';

describe('TasksService', () => {
  let service: TasksService;
  let mockPrismaService: any;
  let mockTrackingService: any;
  let mockCacheService: any;

  beforeEach(async () => {
    mockPrismaService = {
      task: {
        create: jest.fn(),
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        update: jest.fn(),
        updateMany: jest.fn(),
        delete: jest.fn(),
        count: jest.fn(),
      },
      $transaction: jest.fn(),
    };

    mockTrackingService = {
      stopAllActiveSessions: jest.fn(),
      createSession: jest.fn(),
      stop: jest.fn(),
      checkAndCompleteIfNeeded: jest.fn(),
    };

    mockPrismaService.trackingSession = {
      findFirst: jest.fn(),
    };

    mockCacheService = {
      get: jest.fn(),
      set: jest.fn(),
      del: jest.fn(),
      getOrSet: jest.fn(async (_key: string, factory: () => Promise<any>) => factory()),
      invalidatePattern: jest.fn(),
    };

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        TasksService,
        { provide: PrismaService, useValue: mockPrismaService },
        { provide: TrackingService, useValue: mockTrackingService },
        { provide: CacheService, useValue: mockCacheService },
      ],
    }).compile();

    service = module.get<TasksService>(TasksService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a task with PLANNED status', async () => {
      const createTaskDto = {
        name: 'Build authentication module',
        estimateHours: 6,
        deadline: '2025-12-30',
      };
      const userId = 'user-id';

      const expectedTask = {
        id: 'task-id',
        ...createTaskDto,
        deadline: new Date(createTaskDto.deadline),
        status: TaskStatus.PLANNED,
        isActive: false,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.task.create.mockResolvedValue(expectedTask);

      const result = await service.create(createTaskDto, userId);

      expect(result).toEqual(expectedTask);
      expect(mockPrismaService.task.create).toHaveBeenCalledWith({
        data: {
          name: createTaskDto.name,
          estimateHours: createTaskDto.estimateHours,
          deadline: new Date(createTaskDto.deadline),
          status: TaskStatus.PLANNED,
          isActive: false,
          userId,
        },
        select: expect.any(Object),
      });
    });
  });

  describe('findOne', () => {
    it('should return a task', async () => {
      const taskId = 'task-id';
      const userId = 'user-id';
      const expectedTask = {
        id: taskId,
        name: 'Test Task',
        userId,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(expectedTask);

      const result = await service.findOne(taskId, userId);

      expect(result).toEqual(expectedTask);
      expect(mockPrismaService.task.findUnique).toHaveBeenCalledWith({
        where: { id: taskId },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if task not found', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id', 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own task', async () => {
      const task = {
        id: 'task-id',
        userId: 'other-user-id',
      };

      mockPrismaService.task.findUnique.mockResolvedValue(task);

      await expect(service.findOne('task-id', 'user-id')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('findActive', () => {
    it('should return active task', async () => {
      const userId = 'user-id';
      const expectedTask = {
        id: 'task-id',
        userId,
        status: TaskStatus.ACTIVE,
        isActive: true,
      };

      mockPrismaService.task.findFirst.mockResolvedValue(expectedTask);

      const result = await service.findActive(userId);

      expect(result).toEqual(expectedTask);
      expect(mockPrismaService.task.findFirst).toHaveBeenCalledWith({
        where: {
          userId,
          isActive: true,
          status: TaskStatus.ACTIVE,
        },
        select: expect.any(Object),
      });
    });

    it('should return null if no active task', async () => {
      mockPrismaService.task.findFirst.mockResolvedValue(null);

      const result = await service.findActive('user-id');

      expect(result).toBeNull();
    });
  });

  describe('activate', () => {
    it('should activate a task and deactivate others', async () => {
      const taskId = 'task-id';
      const userId = 'user-id';

      const existingTask = {
        id: taskId,
        userId,
        status: TaskStatus.PLANNED,
        isActive: false,
      };

      const updatedTask = {
        ...existingTask,
        status: TaskStatus.ACTIVE,
        isActive: true,
      };

      const mockTracking = {
        id: 'tracking-id',
        taskId,
        userId,
        startTime: new Date(),
        accumulatedTime: 0,
        status: 'active',
        expEarned: 0,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(existingTask);
      mockTrackingService.stopAllActiveSessions.mockResolvedValue(undefined);
      mockTrackingService.createSession.mockResolvedValue(mockTracking);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          task: {
            updateMany: jest.fn().mockResolvedValue({}),
            update: jest.fn().mockResolvedValue(updatedTask),
          },
          expTracking: {
            findMany: jest.fn().mockResolvedValue([]),
            findFirst: jest.fn().mockResolvedValue(null),
            create: jest.fn().mockResolvedValue(mockTracking),
          },
        });
      });

      const result = await service.activate(taskId, userId);

      expect(result.task.status).toBe(TaskStatus.ACTIVE);
      expect(result.task.isActive).toBe(true);
      expect(result.session).toBeDefined();
      expect(result.session.status).toBe('active');
      expect(mockTrackingService.stopAllActiveSessions).toHaveBeenCalledWith(
        userId,
        undefined,
        expect.anything(),
      );
      expect(mockTrackingService.createSession).toHaveBeenCalledWith(
        taskId,
        userId,
        expect.anything(),
      );
    });

    it('should throw BadRequestException if task is already DONE', async () => {
      const task = {
        id: 'task-id',
        userId: 'user-id',
        status: TaskStatus.DONE,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(task);

      await expect(service.activate('task-id', 'user-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('deactivate', () => {
    it('should stop active session and deactivate task', async () => {
      const taskId = 'task-id';
      const userId = 'user-id';

      const activeTask = {
        id: taskId,
        userId,
        status: TaskStatus.ACTIVE,
        isActive: true,
        name: 'Task',
        estimateHours: 1,
        deadline: new Date(),
        progress: 10,
        totalTimeSpent: 100,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      const deactivatedTask = {
        ...activeTask,
        status: TaskStatus.PLANNED,
        isActive: false,
      };

      const activeSession = {
        id: 'session-id',
        taskId,
        userId,
        status: 'active',
      };

      const stoppedSession = {
        id: 'session-id',
        status: 'stopped',
        duration: 60,
      };

      mockPrismaService.task.findUnique
        .mockResolvedValueOnce(activeTask)
        .mockResolvedValueOnce(deactivatedTask);
      mockPrismaService.trackingSession.findFirst.mockResolvedValue(activeSession);
      mockTrackingService.stop.mockResolvedValue(stoppedSession);

      const result = await service.deactivate(taskId, userId);

      expect(mockTrackingService.stop).toHaveBeenCalledWith('session-id', userId);
      expect(result.task.isActive).toBe(false);
      expect(result.session).toEqual(stoppedSession);
    });

    it('should throw BadRequestException if task is not active', async () => {
      const inactiveTask = {
        id: 'task-id',
        userId: 'user-id',
        status: TaskStatus.PLANNED,
        isActive: false,
        name: 'Task',
        estimateHours: 1,
        deadline: new Date(),
        progress: 0,
        totalTimeSpent: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.task.findUnique.mockResolvedValue(inactiveTask);
      mockPrismaService.trackingSession.findFirst.mockResolvedValue(null);

      await expect(service.deactivate('task-id', 'user-id')).rejects.toThrow(BadRequestException);
    });
  });

  describe('complete', () => {
    it('should complete a task', async () => {
      const taskId = 'task-id';
      const userId = 'user-id';

      const existingTask = {
        id: taskId,
        userId,
        status: TaskStatus.ACTIVE,
        isActive: true,
        estimateHours: 6,
      };

      const completedTask = {
        ...existingTask,
        status: TaskStatus.DONE,
        isActive: false,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(existingTask);
      mockPrismaService.$transaction.mockImplementation(async (callback) => {
        return callback({
          task: {
            findUnique: jest.fn().mockResolvedValue(existingTask),
            update: jest.fn().mockResolvedValue(completedTask),
          },
          trackingSession: {
            findFirst: jest.fn().mockResolvedValue(null),
            update: jest.fn(),
          },
        });
      });

      const result = await service.complete(taskId, userId);

      expect(result.status).toBe(TaskStatus.DONE);
      expect(result.isActive).toBe(false);
    });
  });

  describe('update', () => {
    it('should update a task', async () => {
      const taskId = 'task-id';
      const userId = 'user-id';
      const updateDto = { name: 'Updated Task' };

      const existingTask = {
        id: taskId,
        userId,
        name: 'Old Task',
      };

      const updatedTask = {
        ...existingTask,
        ...updateDto,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(existingTask);
      mockPrismaService.task.update.mockResolvedValue(updatedTask);

      const result = await service.update(taskId, updateDto, userId);

      expect(result.name).toBe('Updated Task');
    });
  });

  describe('findAll', () => {
    const userId = 'user-id';

    beforeEach(() => {
      mockPrismaService.task.findMany.mockResolvedValue([]);
      mockPrismaService.task.count.mockResolvedValue(0);
    });

    it('should filter by single status', async () => {
      await service.findAll({ status: TaskStatus.ACTIVE }, userId);

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            status: TaskStatus.ACTIVE,
          }),
        }),
      );
    });

    it('should filter by multiple statuses', async () => {
      await service.findAll({ statuses: [TaskStatus.PLANNED, TaskStatus.ACTIVE] }, userId);

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            status: { in: [TaskStatus.PLANNED, TaskStatus.ACTIVE] },
          }),
        }),
      );
    });

    it('should exclude done tasks when excludeDone is true', async () => {
      await service.findAll({ excludeDone: true }, userId);

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            status: { not: TaskStatus.DONE },
          }),
        }),
      );
    });

    it('should prioritize excludeDone over statuses and status', async () => {
      await service.findAll(
        {
          excludeDone: true,
          statuses: [TaskStatus.DONE],
          status: TaskStatus.DONE,
        },
        userId,
      );

      expect(mockPrismaService.task.findMany).toHaveBeenCalledWith(
        expect.objectContaining({
          where: expect.objectContaining({
            userId,
            status: { not: TaskStatus.DONE },
          }),
        }),
      );
    });
  });

  describe('remove', () => {
    it('should delete a task', async () => {
      const taskId = 'task-id';
      const userId = 'user-id';

      const existingTask = {
        id: taskId,
        userId,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(existingTask);
      mockPrismaService.task.delete.mockResolvedValue(existingTask);

      const result = await service.remove(taskId, userId);

      expect(result).toEqual({ message: 'Task deleted successfully' });
      expect(mockPrismaService.task.delete).toHaveBeenCalledWith({
        where: { id: taskId },
      });
    });
  });
});

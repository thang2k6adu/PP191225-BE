import { Test, TestingModule } from '@nestjs/testing';
import { ExpService } from './exp.service';
import { PrismaService } from '@/database/prisma.service';
import { NotFoundException, ForbiddenException, BadRequestException } from '@nestjs/common';
import { TrackingStatus } from '@prisma/client';

describe('ExpService', () => {
  let service: ExpService;

  const mockPrismaService = {
    task: {
      findUnique: jest.fn(),
    },
    expTracking: {
      findFirst: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ExpService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ExpService>(ExpService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('start', () => {
    it('should start tracking a task', async () => {
      const startDto = {
        taskId: 'task-id',
        roomId: 'room-id',
      };
      const userId = 'user-id';

      const task = {
        id: 'task-id',
        userId,
        estimateHours: 4,
      };

      const expectedTracking = {
        id: 'tracking-id',
        taskId: startDto.taskId,
        userId,
        startTime: new Date(),
        accumulatedTime: 0,
        status: TrackingStatus.active,
        expEarned: 0,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.task.findUnique.mockResolvedValue(task);
      mockPrismaService.expTracking.findFirst.mockResolvedValue(null);
      mockPrismaService.expTracking.create.mockResolvedValue(expectedTracking);

      const result = await service.start(startDto, userId);

      expect(result).toHaveProperty('trackingId');
      expect(result.status).toBe(TrackingStatus.active);
      expect(result.accumulatedTime).toBe(0);
      expect(mockPrismaService.expTracking.create).toHaveBeenCalled();
    });

    it('should throw NotFoundException if task not found', async () => {
      mockPrismaService.task.findUnique.mockResolvedValue(null);

      await expect(service.start({ taskId: 'non-existent-id' }, 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw ForbiddenException if user does not own task', async () => {
      const task = {
        id: 'task-id',
        userId: 'other-user-id',
        estimateHours: 4,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(task);

      await expect(service.start({ taskId: 'task-id' }, 'user-id')).rejects.toThrow(
        ForbiddenException,
      );
    });

    it('should throw BadRequestException if task is already being tracked', async () => {
      const task = {
        id: 'task-id',
        userId: 'user-id',
        estimateHours: 4,
      };

      const activeTracking = {
        id: 'tracking-id',
        taskId: 'task-id',
        userId: 'user-id',
        status: TrackingStatus.active,
      };

      mockPrismaService.task.findUnique.mockResolvedValue(task);
      mockPrismaService.expTracking.findFirst.mockResolvedValue(activeTracking);

      await expect(service.start({ taskId: 'task-id' }, 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });

    it('should throw BadRequestException if task is already stopped', async () => {
      const task = {
        id: 'task-id',
        userId: 'user-id',
        estimateHours: 4,
      };

      const stoppedTracking = {
        id: 'tracking-id',
        taskId: 'task-id',
        userId: 'user-id',
        status: TrackingStatus.stopped,
        createdAt: new Date(),
      };

      mockPrismaService.task.findUnique.mockResolvedValue(task);
      // First call: check active tracking (returns null)
      // Second call: get latest tracking (returns stopped)
      mockPrismaService.expTracking.findFirst
        .mockResolvedValueOnce(null)
        .mockResolvedValueOnce(stoppedTracking);

      await expect(service.start({ taskId: 'task-id' }, 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('pause', () => {
    it('should pause tracking a task', async () => {
      const pauseDto = { taskId: 'task-id' };
      const userId = 'user-id';

      const activeTracking = {
        id: 'tracking-id',
        taskId: 'task-id',
        userId,
        startTime: new Date(Date.now() - 3600000), // 1 hour ago
        accumulatedTime: 0,
        status: TrackingStatus.active,
      };

      const pausedTracking = {
        ...activeTracking,
        status: TrackingStatus.paused,
        accumulatedTime: 3600,
        startTime: null,
      };

      mockPrismaService.expTracking.findFirst.mockResolvedValue(activeTracking);
      mockPrismaService.expTracking.update.mockResolvedValue(pausedTracking);

      const result = await service.pause(pauseDto, userId);

      expect(result.status).toBe(TrackingStatus.paused);
      expect(result.accumulatedTime).toBeGreaterThan(0);
      expect(mockPrismaService.expTracking.update).toHaveBeenCalled();
    });

    it('should throw BadRequestException if no active tracking found', async () => {
      mockPrismaService.expTracking.findFirst.mockResolvedValue(null);

      await expect(service.pause({ taskId: 'task-id' }, 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('resume', () => {
    it('should resume tracking a task', async () => {
      const resumeDto = { taskId: 'task-id' };
      const userId = 'user-id';

      const pausedTracking = {
        id: 'tracking-id',
        taskId: 'task-id',
        userId,
        startTime: null,
        accumulatedTime: 3600,
        status: TrackingStatus.paused,
      };

      const resumedTracking = {
        ...pausedTracking,
        status: TrackingStatus.active,
        startTime: new Date(),
      };

      mockPrismaService.expTracking.findFirst.mockResolvedValue(pausedTracking);
      mockPrismaService.expTracking.update.mockResolvedValue(resumedTracking);

      const result = await service.resume(resumeDto, userId);

      expect(result.status).toBe(TrackingStatus.active);
      expect(result.startTime).toBeDefined();
      expect(mockPrismaService.expTracking.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if no tracking found', async () => {
      mockPrismaService.expTracking.findFirst.mockResolvedValue(null);

      await expect(service.resume({ taskId: 'task-id' }, 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if task is already active', async () => {
      const activeTracking = {
        id: 'tracking-id',
        taskId: 'task-id',
        userId: 'user-id',
        status: TrackingStatus.active,
      };

      mockPrismaService.expTracking.findFirst.mockResolvedValue(activeTracking);

      await expect(service.resume({ taskId: 'task-id' }, 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('stop', () => {
    it('should stop tracking and calculate EXP', async () => {
      const stopDto = { taskId: 'task-id' };
      const userId = 'user-id';

      const task = {
        id: 'task-id',
        estimateHours: 4, // 4 hours = 240 minutes
      };

      const activeTracking = {
        id: 'tracking-id',
        taskId: 'task-id',
        userId,
        startTime: new Date(Date.now() - 7200000), // 2 hours ago
        accumulatedTime: 0,
        status: TrackingStatus.active,
      };

      const stoppedTracking = {
        ...activeTracking,
        status: TrackingStatus.stopped,
        accumulatedTime: 7200, // 2 hours in seconds
        expEarned: 50, // 50% complete = 50 EXP
        startTime: null,
      };

      mockPrismaService.expTracking.findFirst.mockResolvedValue(activeTracking);
      mockPrismaService.task.findUnique.mockResolvedValue(task);
      mockPrismaService.expTracking.update.mockResolvedValue(stoppedTracking);

      const result = await service.stop(stopDto, userId);

      expect(result.status).toBe(TrackingStatus.stopped);
      expect(result.accumulatedTime).toBeGreaterThan(0);
      expect(result.percentComplete).toBeGreaterThan(0);
      expect(result.expEarned).toBeGreaterThan(0);
      expect(mockPrismaService.expTracking.update).toHaveBeenCalled();
    });

    it('should throw NotFoundException if no tracking found', async () => {
      mockPrismaService.expTracking.findFirst.mockResolvedValue(null);

      await expect(service.stop({ taskId: 'task-id' }, 'user-id')).rejects.toThrow(
        NotFoundException,
      );
    });

    it('should throw BadRequestException if task is already stopped', async () => {
      const stoppedTracking = {
        id: 'tracking-id',
        taskId: 'task-id',
        userId: 'user-id',
        status: TrackingStatus.stopped,
      };

      mockPrismaService.expTracking.findFirst.mockResolvedValue(stoppedTracking);

      await expect(service.stop({ taskId: 'task-id' }, 'user-id')).rejects.toThrow(
        BadRequestException,
      );
    });
  });

  describe('getProgress', () => {
    it('should get progress for active tracking', async () => {
      const taskId = 'task-id';
      const userId = 'user-id';

      const task = {
        id: 'task-id',
        estimateHours: 4, // 4 hours = 240 minutes
      };

      const activeTracking = {
        id: 'tracking-id',
        taskId,
        userId,
        startTime: new Date(Date.now() - 3600000), // 1 hour ago
        accumulatedTime: 0,
        status: TrackingStatus.active,
        expEarned: null,
      };

      mockPrismaService.expTracking.findFirst.mockResolvedValue(activeTracking);
      mockPrismaService.task.findUnique.mockResolvedValue(task);

      const result = await service.getProgress(taskId, userId);

      expect(result).toHaveProperty('trackingId');
      expect(result).toHaveProperty('status');
      expect(result).toHaveProperty('accumulatedTime');
      expect(result).toHaveProperty('percentComplete');
      expect(result).toHaveProperty('expEarned');
    });

    it('should throw NotFoundException if no tracking found', async () => {
      mockPrismaService.expTracking.findFirst.mockResolvedValue(null);

      await expect(service.getProgress('task-id', 'user-id')).rejects.toThrow(NotFoundException);
    });
  });
});

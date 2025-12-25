import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { getPaginationOptions, paginate } from '@/common/utils/pagination.util';
import { PaginatedResponse } from '@/common/interfaces/api-response.interface';
import { TaskStatus } from '@prisma/client';
import { TrackingService } from '../tracking/tracking.service';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TrackingService))
    private trackingService: TrackingService,
  ) {}

  async create(createTaskDto: CreateTaskDto, userId: string) {
    const task = await this.prisma.task.create({
      data: {
        name: createTaskDto.name,
        estimateHours: createTaskDto.estimateHours,
        deadline: new Date(createTaskDto.deadline),
        status: TaskStatus.PLANNED,
        isActive: false,
        userId,
      },
      select: {
        id: true,
        name: true,
        estimateHours: true,
        deadline: true,
        status: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return task;
  }

  async findAll(query: QueryTasksDto, userId: string): Promise<PaginatedResponse<any>> {
    const { skip, take, page, limit } = getPaginationOptions(query.page, query.limit);

    const where: any = {
      userId, // Users can only see their own tasks
    };

    // Status filter
    if (query.status) {
      where.status = query.status;
    }

    // Active filter
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    // Search filter
    if (query.search) {
      where.name = {
        contains: query.search,
        mode: 'insensitive' as const,
      };
    }

    const [tasks, total] = await Promise.all([
      this.prisma.task.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          estimateHours: true,
          deadline: true,
          status: true,
          isActive: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: [
          { isActive: 'desc' }, // Active tasks first
          { createdAt: 'desc' },
        ],
      }),
      this.prisma.task.count({ where }),
    ]);

    return paginate(tasks, total, page, limit);
  }

  async findOne(id: string, userId: string) {
    const task = await this.prisma.task.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        estimateHours: true,
        deadline: true,
        status: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check ownership
    if (task.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this task');
    }

    return task;
  }

  async findActive(userId: string) {
    const task = await this.prisma.task.findFirst({
      where: {
        userId,
        isActive: true,
        status: TaskStatus.ACTIVE,
      },
      select: {
        id: true,
        name: true,
        estimateHours: true,
        deadline: true,
        status: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return task;
  }

  async activate(id: string, userId: string) {
    // Find task and verify ownership
    const task = await this.findOne(id, userId);

    // Check if task is already done
    if (task.status === TaskStatus.DONE) {
      throw new BadRequestException('Cannot activate a completed task');
    }

    // Use transaction to ensure only one active task and proper tracking
    const result = await this.prisma.$transaction(async (tx) => {
      // Deactivate all other tasks for this user
      await tx.task.updateMany({
        where: {
          userId,
          isActive: true,
          id: { not: id },
        },
        data: {
          isActive: false,
          status: TaskStatus.PLANNED,
        },
      });

      // Stop all active/paused sessions (except this task)
      await this.trackingService.stopAllActiveSessions(userId, id, tx);

      // Activate this task
      const updatedTask = await tx.task.update({
        where: { id },
        data: {
          status: TaskStatus.ACTIVE,
          isActive: true,
        },
        select: {
          id: true,
          name: true,
          estimateHours: true,
          deadline: true,
          status: true,
          isActive: true,
          progress: true,
          totalTimeSpent: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Create new tracking session
      const session = await this.trackingService.createSession(id, userId, tx);

      return {
        task: updatedTask,
        session,
      };
    });

    return result;
  }

  /**
   * Check if task should be auto-completed based on progress
   * Called by TrackingService when session is stopped
   */
  async checkAndCompleteIfNeeded(taskId: string, progress: number, tx?: any) {
    const prisma = tx || this.prisma;

    // Get task
    const task = await prisma.task.findUnique({
      where: { id: taskId },
      select: { id: true, status: true },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Check if progress >= 100%
    if (progress >= 100 && task.status !== TaskStatus.DONE) {
      // Auto-complete the task
      await prisma.task.update({
        where: { id: taskId },
        data: {
          status: TaskStatus.DONE,
          isActive: false,
        },
      });

      return true; // Task was completed
    }

    return false; // Task not completed
  }

  async complete(id: string, userId: string) {
    // Find task and verify ownership
    await this.findOne(id, userId);

    // Use transaction to update both task and tracking
    const result = await this.prisma.$transaction(async (tx) => {
      // Get task with all fields needed for calculation
      const task = await tx.task.findUnique({
        where: { id },
        select: {
          id: true,
          estimateHours: true,
          totalTimeSpent: true,
          progress: true,
        },
      });

      if (!task) {
        throw new NotFoundException('Task not found');
      }

      // Update task to DONE and deactivate
      const updatedTask = await tx.task.update({
        where: { id },
        data: {
          status: TaskStatus.DONE,
          isActive: false,
        },
        select: {
          id: true,
          name: true,
          estimateHours: true,
          deadline: true,
          status: true,
          isActive: true,
          progress: true,
          totalTimeSpent: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      // Stop any active or paused session for this task
      const activeSession = await tx.trackingSession.findFirst({
        where: {
          taskId: id,
          userId,
          status: { in: ['active', 'paused'] },
        },
      });

      if (activeSession) {
        const now = new Date();
        const duration = Math.floor((now.getTime() - activeSession.startTime.getTime()) / 1000);

        // Calculate final progress
        const newTotalTimeSpent = task.totalTimeSpent + duration;
        const estimatedSeconds = Number(task.estimateHours) * 3600;
        const finalProgress = Math.min((newTotalTimeSpent / estimatedSeconds) * 100, 100);
        const expEarned = duration; // EXP in seconds

        await tx.trackingSession.update({
          where: { id: activeSession.id },
          data: {
            endTime: now,
            duration,
            status: 'stopped',
            expEarned: expEarned,
          },
        });

        // Update task with final progress
        await tx.task.update({
          where: { id },
          data: {
            totalTimeSpent: newTotalTimeSpent,
            progress: finalProgress,
          },
        });
      }

      return updatedTask;
    });

    return result;
  }

  async update(id: string, updateTaskDto: UpdateTaskDto, userId: string) {
    // Find task and verify ownership
    await this.findOne(id, userId);

    // Prepare update data
    const updateData: any = {};

    if (updateTaskDto.name !== undefined) {
      updateData.name = updateTaskDto.name;
    }

    if (updateTaskDto.estimateHours !== undefined) {
      updateData.estimateHours = updateTaskDto.estimateHours;
    }

    if (updateTaskDto.deadline !== undefined) {
      updateData.deadline = new Date(updateTaskDto.deadline);
    }

    if (updateTaskDto.status !== undefined) {
      updateData.status = updateTaskDto.status;
      // If status is not ACTIVE, deactivate
      if (updateTaskDto.status !== TaskStatus.ACTIVE) {
        updateData.isActive = false;
      }
    }

    const updatedTask = await this.prisma.task.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        name: true,
        estimateHours: true,
        deadline: true,
        status: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedTask;
  }

  async remove(id: string, userId: string) {
    // Find task and verify ownership
    await this.findOne(id, userId);

    await this.prisma.task.delete({
      where: { id },
    });

    return { message: 'Task deleted successfully' };
  }
}

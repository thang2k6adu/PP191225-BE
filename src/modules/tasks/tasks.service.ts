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
import { QueryTaskStatsDto, TaskStatsPeriod } from './dto/query-task-stats.dto';
import { getPaginationOptions, paginate } from '@/common/utils/pagination.util';
import { PaginatedResponse } from '@/common/interfaces/api-response.interface';
import { Prisma, TaskStatus } from '@prisma/client';
import { TrackingService } from '../tracking/tracking.service';
import { CacheService } from '@/common/services/cache.service';
import { CacheKeys, CacheTTL } from '@/common/utils/cache-key.util';

@Injectable()
export class TasksService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TrackingService))
    private trackingService: TrackingService,
    private cacheService: CacheService,
  ) {}

  private async invalidateUserTaskCache(userId: string, taskId?: string): Promise<void> {
    await this.cacheService.del(CacheKeys.tasks.active(userId));
    // Cứ nghĩ tới 1 pattern thì thường là list pattern (vì có nhiều page cho 1 list)
    await this.cacheService.invalidatePattern(CacheKeys.tasks.listPattern(userId));
    await this.cacheService.invalidatePattern(CacheKeys.tasks.statsPattern(userId));
    if (taskId) {
      await this.cacheService.del(CacheKeys.tasks.detail(userId, taskId));
    }
  }

  // Khoang thoi gian can thong ke
  private getDateRange(period: TaskStatsPeriod, anchorDate: Date) {
    const from = new Date(anchorDate);
    const to = new Date(anchorDate);

    if (period === TaskStatsPeriod.DAY) {
      // day view => daily buckets inside current month
      from.setUTCDate(1);
      from.setUTCHours(0, 0, 0, 0);

      to.setUTCMonth(to.getUTCMonth() + 1, 1);
      to.setUTCHours(0, 0, 0, 0);
      return { from, to };
    }

    if (period === TaskStatsPeriod.MONTH) {
      from.setUTCMonth(0, 1);
      from.setUTCHours(0, 0, 0, 0);

      to.setUTCFullYear(to.getUTCFullYear() + 1, 0, 1);
      to.setUTCHours(0, 0, 0, 0);
      return { from, to };
    }

    // year view => yearly buckets in rolling 5-year window
    const anchorYear = anchorDate.getUTCFullYear();
    from.setUTCFullYear(anchorYear - 4, 0, 1);
    from.setUTCHours(0, 0, 0, 0);

    to.setUTCFullYear(anchorYear + 1, 0, 1);
    to.setUTCHours(0, 0, 0, 0);
    return { from, to };
  }

  private getBucketGranularity(period: TaskStatsPeriod): 'day' | 'month' | 'year' {
    if (period === TaskStatsPeriod.DAY) {
      return 'day';
    }

    if (period === TaskStatsPeriod.MONTH) {
      return 'month';
    }

    return 'year';
  }

  // Nếu ngày thì là 0h, nếu tháng thì là ngày 1, nếu năm thì là tháng 1 ngày 1
  private getBucketStart(period: TaskStatsPeriod, from: Date): Date {
    const bucket = new Date(from);

    if (period === TaskStatsPeriod.DAY) {
      bucket.setUTCHours(0, 0, 0, 0);
      return bucket;
    }

    if (period === TaskStatsPeriod.MONTH) {
      bucket.setUTCDate(1);
      bucket.setUTCHours(0, 0, 0, 0);
      return bucket;
    }

    bucket.setUTCMonth(0, 1);
    bucket.setUTCHours(0, 0, 0, 0);
    return bucket;
  }

  // Nhảy mốc tiếp theo VD DAY + 1 ngày, Month + 1 tháng,...
  private getNextBucket(period: TaskStatsPeriod, current: Date): Date {
    const next = new Date(current);

    if (period === TaskStatsPeriod.DAY) {
      next.setUTCDate(next.getUTCDate() + 1);
      return next;
    }

    if (period === TaskStatsPeriod.MONTH) {
      next.setUTCMonth(next.getUTCMonth() + 1, 1);
      return next;
    }

    next.setUTCFullYear(next.getUTCFullYear() + 1, 0, 1);
    return next;
  }

  async getStats(query: QueryTaskStatsDto, userId: string) {
    const period = query.period || TaskStatsPeriod.MONTH;
    const anchorDate = query.anchorDate ? new Date(query.anchorDate) : new Date();
    const { from, to } = this.getDateRange(period, anchorDate);

    const cacheKey = CacheKeys.tasks.stats(userId, query);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const granularity = this.getBucketGranularity(period);

        const bucketExpr = Prisma.raw(
          `date_trunc('${granularity}', "createdAt" AT TIME ZONE 'UTC') AT TIME ZONE 'UTC'`,
        );

        const statusRows = await this.prisma.$queryRaw<Array<{ status: string; count: number }>>(
          Prisma.sql`
            SELECT "status"::text AS status, COUNT(*)::int AS count
            FROM "tasks"
            WHERE "userId" = ${userId}
              AND "createdAt" >= ${from}
              AND "createdAt" < ${to}
            GROUP BY "status"
          `,
        );

        const summary = {
          planned: 0,
          inProgress: 0,
          completed: 0,
        };

        for (const row of statusRows) {
          if (row.status === TaskStatus.PLANNED) {
            summary.planned = Number(row.count);
          } else if (row.status === TaskStatus.ACTIVE) {
            summary.inProgress = Number(row.count);
          } else if (row.status === TaskStatus.DONE) {
            summary.completed = Number(row.count);
          }
        }

        const seriesRows = await this.prisma.$queryRaw<Array<{ bucket: Date; count: number }>>(
          Prisma.sql`
            SELECT ${bucketExpr} AS bucket, COUNT(*)::int AS count
            FROM "tasks"
            WHERE "userId" = ${userId}
              AND "createdAt" >= ${from}
              AND "createdAt" < ${to}
            GROUP BY bucket
            ORDER BY bucket ASC
          `,
        );

        const countByTimestamp = new Map<string, number>();
        for (const row of seriesRows) {
          countByTimestamp.set(new Date(row.bucket).toISOString(), Number(row.count));
        }

        const series: Array<{ timestamp: string; count: number }> = [];
        let bucket = this.getBucketStart(period, from);
        while (bucket < to) {
          const timestamp = bucket.toISOString();
          series.push({
            timestamp,
            count: countByTimestamp.get(timestamp) || 0,
          });
          bucket = this.getNextBucket(period, bucket);
        }

        return {
          range: {
            from: from.toISOString(),
            to: to.toISOString(),
          },
          summary,
          series,
        };
      },
      CacheTTL.taskStats,
    );
  }

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

    await this.invalidateUserTaskCache(userId, task.id);

    return task;
  }

  async findAll(query: QueryTasksDto, userId: string): Promise<PaginatedResponse<any>> {
    const cacheKey = CacheKeys.tasks.list(userId, query);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
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
              progress: true,
              totalTimeSpent: true,
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
      },
      CacheTTL.taskList,
    );
  }

  async findOne(id: string, userId: string) {
    const cacheKey = CacheKeys.tasks.detail(userId, id);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const task = await this.prisma.task.findUnique({
          where: { id },
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

        if (!task) {
          throw new NotFoundException('Task not found');
        }

        // Check ownership
        if (task.userId !== userId) {
          throw new ForbiddenException('You do not have permission to access this task');
        }

        return task;
      },
      CacheTTL.taskDetail,
    );
  }

  async findActive(userId: string) {
    const cacheKey = CacheKeys.tasks.active(userId);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
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
            progress: true,
            totalTimeSpent: true,
            userId: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        return task;
      },
      CacheTTL.taskActive,
    );
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

    await this.invalidateUserTaskCache(userId, id);

    return result;
  }

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

      const ownerTask = await prisma.task.findUnique({
        where: { id: taskId },
        select: { userId: true },
      });
      if (ownerTask?.userId) {
        await this.invalidateUserTaskCache(ownerTask.userId, taskId);
      }

      return true;
    }

    return false;
  }

  async complete(id: string, userId: string) {
    await this.findOne(id, userId);

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

    await this.invalidateUserTaskCache(userId, id);

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
        progress: true,
        totalTimeSpent: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.invalidateUserTaskCache(userId, id);

    return updatedTask;
  }

  async remove(id: string, userId: string) {
    // Find task and verify ownership
    await this.findOne(id, userId);

    await this.prisma.task.delete({
      where: { id },
    });

    await this.invalidateUserTaskCache(userId, id);

    return { message: 'Task deleted successfully' };
  }
}

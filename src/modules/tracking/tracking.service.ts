import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { GetProgressDto } from './dto/get-progress.dto';
import { SessionStatus, TaskStatus } from '@prisma/client';
import { TasksService } from '../tasks/tasks.service';

@Injectable()
export class TrackingService {
  constructor(
    private prisma: PrismaService,
    @Inject(forwardRef(() => TasksService))
    private tasksService: TasksService,
  ) {}

  async createSession(taskId: string, userId: string, tx?: any) {
    const prisma = tx || this.prisma;

    return await prisma.trackingSession.create({
      data: {
        taskId,
        userId,
        startTime: new Date(),
        endTime: null,
        duration: 0,
        status: SessionStatus.active,
        expEarned: 0,
      },
      select: {
        id: true,
        taskId: true,
        userId: true,
        startTime: true,
        endTime: true,
        duration: true,
        status: true,
        expEarned: true,
        createdAt: true,
        updatedAt: true,
      },
    });
  }

  async stopAllActiveSessions(userId: string, excludeTaskId?: string, tx?: any) {
    const prisma = tx || this.prisma;

    const activeSessions = await prisma.trackingSession.findMany({
      where: {
        userId,
        status: { in: [SessionStatus.active, SessionStatus.paused] },
        ...(excludeTaskId && { taskId: { not: excludeTaskId } }),
      },
      include: { task: true },
    });

    const now = new Date();

    for (const session of activeSessions) {
      const task = session.task;
      const previousProgress = task.progress;

      const duration = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

      await prisma.trackingSession.update({
        where: { id: session.id },
        data: {
          endTime: now,
          duration,
          status: SessionStatus.stopped,
          expEarned: duration,
          previousProgress: previousProgress,
        },
      });

      const newTotalTimeSpent = task.totalTimeSpent + duration;
      const estimatedSeconds = Number(task.estimateHours) * 3600;
      const newProgress = Math.min((newTotalTimeSpent / estimatedSeconds) * 100, 100);

      await prisma.task.update({
        where: { id: session.taskId },
        data: {
          totalTimeSpent: newTotalTimeSpent,
          progress: newProgress,
          isActive: false,
          status: TaskStatus.PLANNED,
        },
      });
    }
  }

  async stop(sessionId: string, userId: string) {
    const session = await this.prisma.trackingSession.findUnique({
      where: { id: sessionId },
      include: { task: true },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have permission to stop this session');
    }

    if (session.status === SessionStatus.stopped) {
      throw new BadRequestException('Session is already stopped');
    }

    const now = new Date();
    const duration = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

    const task = session.task;
    const previousProgress = task.progress;
    const newTotalTimeSpent = task.totalTimeSpent + duration;
    const estimatedSeconds = Number(task.estimateHours) * 3600;
    const newProgress = Math.min((newTotalTimeSpent / estimatedSeconds) * 100, 100);

    const expEarned = duration;

    const result = await this.prisma.$transaction(async (tx) => {
      const updatedSession = await tx.trackingSession.update({
        where: { id: sessionId },
        data: {
          endTime: now,
          duration,
          status: SessionStatus.stopped,
          expEarned: expEarned,
          previousProgress: previousProgress,
        },
        select: {
          id: true,
          taskId: true,
          userId: true,
          startTime: true,
          endTime: true,
          duration: true,
          status: true,
          expEarned: true,
          previousProgress: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      await tx.task.update({
        where: { id: session.taskId },
        data: {
          totalTimeSpent: newTotalTimeSpent,
          progress: newProgress,
          isActive: false,
          status: TaskStatus.PLANNED,
        },
      });

      if (newProgress >= 100 && task.status !== TaskStatus.DONE) {
        await this.tasksService.checkAndCompleteIfNeeded(session.taskId, newProgress, tx);
      }

      return {
        ...updatedSession,
        progress: newProgress,
      };
    });

    return result;
  }

  async getProgress(query: GetProgressDto, userId: string) {
    const { taskId } = query;

    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        userId: true,
        estimateHours: true,
        progress: true,
        totalTimeSpent: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.userId !== userId) {
      throw new ForbiddenException('You do not have permission to view this task');
    }

    const sessions = await this.prisma.trackingSession.findMany({
      where: { taskId },
      orderBy: { createdAt: 'desc' },
      select: {
        id: true,
        startTime: true,
        endTime: true,
        duration: true,
        status: true,
        expEarned: true,
        previousProgress: true,
        createdAt: true,
      },
    });

    const activeSession = sessions.find((s) => s.status === SessionStatus.active);

    let currentProgress = task.progress;
    let currentTotalTime = task.totalTimeSpent;

    if (activeSession) {
      const now = new Date();
      const activeDuration = Math.floor((now.getTime() - activeSession.startTime.getTime()) / 1000);
      currentTotalTime += activeDuration;
      const estimatedSeconds = Number(task.estimateHours) * 3600;
      currentProgress = Math.min((currentTotalTime / estimatedSeconds) * 100, 100);
    }

    const estimatedSeconds = Number(task.estimateHours) * 3600;
    const expEarned = currentTotalTime;

    return {
      progress: Math.round(currentProgress * 100) / 100,
      totalTimeSpent: currentTotalTime,
      estimateSeconds: estimatedSeconds,
      expEarned: expEarned,
      sessions,
      currentSession: activeSession
        ? {
            ...activeSession,
            currentDuration: Math.floor(
              (new Date().getTime() - activeSession.startTime.getTime()) / 1000,
            ),
          }
        : null,
    };
  }
}

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

  /**
   * Create new tracking session when task is activated
   */
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

  /**
   * Stop all active/paused sessions for a user (except excluded task)
   * Called when activating a different task
   */
  async stopAllActiveSessions(userId: string, excludeTaskId?: string, tx?: any) {
    const prisma = tx || this.prisma;

    // Find all active or paused sessions
    const activeSessions = await prisma.trackingSession.findMany({
      where: {
        userId,
        status: { in: [SessionStatus.active, SessionStatus.paused] },
        ...(excludeTaskId && { taskId: { not: excludeTaskId } }),
      },
      include: { task: true },
    });

    const now = new Date();

    // Stop each session and update task progress
    for (const session of activeSessions) {
      const task = session.task;
      const previousProgress = task.progress;

      // Calculate duration
      const duration = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

      // Update session
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

      // Update task totalTimeSpent and progress
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

  /**
   * Pause a tracking session (temporary stop)
   */
  async pause(sessionId: string, userId: string) {
    const session = await this.prisma.trackingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have permission to pause this session');
    }

    if (session.status !== SessionStatus.active) {
      throw new BadRequestException('Session is not active');
    }

    // Update status to paused (keep endTime null)
    const updatedSession = await this.prisma.trackingSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.paused },
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

    // Calculate current duration (not saved yet)
    const now = new Date();
    const currentDuration = Math.floor((now.getTime() - session.startTime.getTime()) / 1000);

    return {
      ...updatedSession,
      currentDuration, // For display only
    };
  }

  /**
   * Resume a paused session
   */
  async resume(sessionId: string, userId: string) {
    const session = await this.prisma.trackingSession.findUnique({
      where: { id: sessionId },
    });

    if (!session) {
      throw new NotFoundException('Session not found');
    }

    if (session.userId !== userId) {
      throw new ForbiddenException('You do not have permission to resume this session');
    }

    if (session.status !== SessionStatus.paused) {
      throw new BadRequestException('Session is not paused');
    }

    // Update status to active
    const updatedSession = await this.prisma.trackingSession.update({
      where: { id: sessionId },
      data: { status: SessionStatus.active },
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

    return updatedSession;
  }

  /**
   * Stop and finalize a session
   */
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

    // Calculate new task progress
    const task = session.task;
    const previousProgress = task.progress;
    const newTotalTimeSpent = task.totalTimeSpent + duration;
    const estimatedSeconds = Number(task.estimateHours) * 3600;
    const newProgress = Math.min((newTotalTimeSpent / estimatedSeconds) * 100, 100);

    // Calculate EXP (in seconds)
    const expEarned = duration;

    // Use transaction to update both session and task
    const result = await this.prisma.$transaction(async (tx) => {
      // Update session
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

      // Update task
      await tx.task.update({
        where: { id: session.taskId },
        data: {
          totalTimeSpent: newTotalTimeSpent,
          progress: newProgress,
          isActive: false,
          status: TaskStatus.PLANNED,
        },
      });

      // Check auto-complete
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

  /**
   * Get task progress with all sessions
   */
  async getProgress(query: GetProgressDto, userId: string) {
    const { taskId } = query;

    // Verify task ownership
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

    // Get all sessions for this task
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

    // Find active session if any
    const activeSession = sessions.find((s) => s.status === SessionStatus.active);

    // Calculate current progress including active session
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

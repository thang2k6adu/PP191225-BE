import {
  Injectable,
  NotFoundException,
  BadRequestException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { StartExpTrackingDto } from './dto/start-exp-tracking.dto';
import { PauseExpTrackingDto } from './dto/pause-exp-tracking.dto';
import { ResumeExpTrackingDto } from './dto/resume-exp-tracking.dto';
import { StopExpTrackingDto } from './dto/stop-exp-tracking.dto';
import { TrackingStatus } from '@prisma/client';

@Injectable()
export class ExpService {
  // Default expMax value, can be configured later
  private readonly EXP_MAX = 100;

  constructor(private prisma: PrismaService) {}

  /**
   * Compute EXP based on accumulated time and estimated time
   */
  private computeExp(
    accumulatedTimeSec: number,
    estimatedTimeMin: number,
    expMax: number = this.EXP_MAX,
  ): { percentComplete: number; expEarned: number } {
    const estimatedTimeSec = estimatedTimeMin * 60;
    const percentComplete = Math.min((accumulatedTimeSec / estimatedTimeSec) * 100, 100);
    const expEarned = (percentComplete / 100) * expMax;

    return {
      percentComplete: Math.round(percentComplete * 100) / 100, // Round to 2 decimal places
      expEarned: Math.round(expEarned * 100) / 100,
    };
  }

  /**
   * Get active tracking for a task and user
   */
  private async getActiveTracking(taskId: string, userId: string) {
    return this.prisma.expTracking.findFirst({
      where: {
        taskId,
        userId,
        status: TrackingStatus.active,
      },
    });
  }

  /**
   * Get latest tracking for a task and user (any status)
   */
  private async getLatestTracking(taskId: string, userId: string) {
    return this.prisma.expTracking.findFirst({
      where: {
        taskId,
        userId,
      },
      orderBy: {
        createdAt: 'desc',
      },
    });
  }

  /**
   * Start tracking a task
   */
  async start(startDto: StartExpTrackingDto, userId: string) {
    // Verify task exists and user owns it
    const task = await this.prisma.task.findUnique({
      where: { id: startDto.taskId },
      select: {
        id: true,
        userId: true,
        estimateHours: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    if (task.userId !== userId) {
      throw new ForbiddenException('You do not have permission to track this task');
    }

    // Check if there's already an active tracking
    const activeTracking = await this.getActiveTracking(startDto.taskId, userId);
    if (activeTracking) {
      throw new BadRequestException('Task is already being tracked');
    }

    // Check if there's a stopped tracking (can't restart a stopped task)
    const latestTracking = await this.getLatestTracking(startDto.taskId, userId);
    if (latestTracking?.status === TrackingStatus.stopped) {
      throw new BadRequestException('Cannot start tracking for a stopped task');
    }

    // Create new tracking
    const tracking = await this.prisma.expTracking.create({
      data: {
        taskId: startDto.taskId,
        userId,
        startTime: new Date(),
        status: TrackingStatus.active,
        accumulatedTime: 0,
        expEarned: 0,
      },
      select: {
        id: true,
        taskId: true,
        userId: true,
        startTime: true,
        accumulatedTime: true,
        status: true,
        expEarned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      trackingId: tracking.id,
      status: tracking.status,
      startTime: tracking.startTime,
      accumulatedTime: tracking.accumulatedTime,
    };
  }

  /**
   * Pause tracking a task
   */
  async pause(pauseDto: PauseExpTrackingDto, userId: string) {
    const tracking = await this.getActiveTracking(pauseDto.taskId, userId);

    if (!tracking) {
      throw new BadRequestException('No active tracking found for this task');
    }

    if (tracking.userId !== userId) {
      throw new ForbiddenException('You do not have permission to pause this tracking');
    }

    // Calculate accumulated time
    const now = new Date();
    const startTime = tracking.startTime || now;
    const elapsedSeconds = Math.floor((now.getTime() - startTime.getTime()) / 1000);
    const newAccumulatedTime = tracking.accumulatedTime + elapsedSeconds;

    // Update tracking
    const updatedTracking = await this.prisma.expTracking.update({
      where: { id: tracking.id },
      data: {
        status: TrackingStatus.paused,
        accumulatedTime: newAccumulatedTime,
        startTime: null,
      },
      select: {
        id: true,
        taskId: true,
        userId: true,
        startTime: true,
        accumulatedTime: true,
        status: true,
        expEarned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      trackingId: updatedTracking.id,
      status: updatedTracking.status,
      accumulatedTime: updatedTracking.accumulatedTime,
    };
  }

  /**
   * Resume tracking a task
   */
  async resume(resumeDto: ResumeExpTrackingDto, userId: string) {
    const latestTracking = await this.getLatestTracking(resumeDto.taskId, userId);

    if (!latestTracking) {
      throw new NotFoundException('No tracking found for this task');
    }

    if (latestTracking.userId !== userId) {
      throw new ForbiddenException('You do not have permission to resume this tracking');
    }

    if (latestTracking.status === TrackingStatus.active) {
      throw new BadRequestException('Task is already being tracked');
    }

    if (latestTracking.status === TrackingStatus.stopped) {
      throw new BadRequestException('Cannot resume a stopped task');
    }

    // Update tracking
    const updatedTracking = await this.prisma.expTracking.update({
      where: { id: latestTracking.id },
      data: {
        status: TrackingStatus.active,
        startTime: new Date(),
      },
      select: {
        id: true,
        taskId: true,
        userId: true,
        startTime: true,
        accumulatedTime: true,
        status: true,
        expEarned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      trackingId: updatedTracking.id,
      status: updatedTracking.status,
      startTime: updatedTracking.startTime,
      accumulatedTime: updatedTracking.accumulatedTime,
    };
  }

  /**
   * Stop tracking a task and calculate EXP
   */
  async stop(stopDto: StopExpTrackingDto, userId: string) {
    const tracking = await this.getLatestTracking(stopDto.taskId, userId);

    if (!tracking) {
      throw new NotFoundException('No tracking found for this task');
    }

    if (tracking.userId !== userId) {
      throw new ForbiddenException('You do not have permission to stop this tracking');
    }

    if (tracking.status === TrackingStatus.stopped) {
      throw new BadRequestException('Task tracking is already stopped');
    }

    // Get task to calculate EXP
    const task = await this.prisma.task.findUnique({
      where: { id: stopDto.taskId },
      select: {
        id: true,
        estimateHours: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Calculate final accumulated time
    let finalAccumulatedTime = tracking.accumulatedTime;
    if (tracking.status === TrackingStatus.active && tracking.startTime) {
      const now = new Date();
      const elapsedSeconds = Math.floor((now.getTime() - tracking.startTime.getTime()) / 1000);
      finalAccumulatedTime = tracking.accumulatedTime + elapsedSeconds;
    }

    // Convert estimateHours (Decimal) to minutes
    const estimatedTimeMin = Number(task.estimateHours) * 60;

    // Calculate EXP
    const { percentComplete, expEarned } = this.computeExp(
      finalAccumulatedTime,
      estimatedTimeMin,
      this.EXP_MAX,
    );

    // Update tracking
    const updatedTracking = await this.prisma.expTracking.update({
      where: { id: tracking.id },
      data: {
        status: TrackingStatus.stopped,
        accumulatedTime: finalAccumulatedTime,
        expEarned,
        startTime: null,
      },
      select: {
        id: true,
        taskId: true,
        userId: true,
        startTime: true,
        accumulatedTime: true,
        status: true,
        expEarned: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return {
      trackingId: updatedTracking.id,
      status: updatedTracking.status,
      accumulatedTime: updatedTracking.accumulatedTime,
      percentComplete,
      expEarned: updatedTracking.expEarned,
    };
  }

  /**
   * Get progress for a task
   */
  async getProgress(taskId: string, userId: string) {
    const tracking = await this.getLatestTracking(taskId, userId);

    if (!tracking) {
      throw new NotFoundException('No tracking found for this task');
    }

    if (tracking.userId !== userId) {
      throw new ForbiddenException('You do not have permission to view this tracking');
    }

    // Get task to calculate current progress
    const task = await this.prisma.task.findUnique({
      where: { id: taskId },
      select: {
        id: true,
        estimateHours: true,
      },
    });

    if (!task) {
      throw new NotFoundException('Task not found');
    }

    // Calculate current accumulated time
    let currentAccumulatedTime = tracking.accumulatedTime;
    if (tracking.status === TrackingStatus.active && tracking.startTime) {
      const now = new Date();
      const elapsedSeconds = Math.floor((now.getTime() - tracking.startTime.getTime()) / 1000);
      currentAccumulatedTime = tracking.accumulatedTime + elapsedSeconds;
    }

    // Convert estimateHours (Decimal) to minutes
    const estimatedTimeMin = Number(task.estimateHours) * 60;

    // Calculate current progress
    let percentComplete = 0;
    let expEarned = tracking.expEarned || 0;

    if (tracking.status === TrackingStatus.stopped) {
      // If stopped, use stored values
      percentComplete = this.computeExp(
        currentAccumulatedTime,
        estimatedTimeMin,
        this.EXP_MAX,
      ).percentComplete;
      expEarned = tracking.expEarned || 0;
    } else {
      // If active or paused, calculate current progress
      const progress = this.computeExp(currentAccumulatedTime, estimatedTimeMin, this.EXP_MAX);
      percentComplete = progress.percentComplete;
      expEarned = progress.expEarned;
    }

    return {
      trackingId: tracking.id,
      status: tracking.status,
      accumulatedTime: currentAccumulatedTime,
      percentComplete,
      expEarned,
    };
  }
}

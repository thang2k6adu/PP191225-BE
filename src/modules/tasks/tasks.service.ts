import {
  Injectable,
  NotFoundException,
  ForbiddenException,
  BadRequestException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { getPaginationOptions, paginate } from '@/common/utils/pagination.util';
import { PaginatedResponse } from '@/common/interfaces/api-response.interface';
import { TaskStatus } from '@prisma/client';

@Injectable()
export class TasksService {
  constructor(private prisma: PrismaService) {}

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

    // Use transaction to ensure only one active task
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
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
      });

      return updatedTask;
    });

    return result;
  }

  async complete(id: string, userId: string) {
    // Find task and verify ownership
    await this.findOne(id, userId);

    // Update task to DONE and deactivate
    const updatedTask = await this.prisma.task.update({
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
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedTask;
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

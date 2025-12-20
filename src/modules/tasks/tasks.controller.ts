import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TasksService } from './tasks.service';
import { CreateTaskDto } from './dto/create-task.dto';
import { UpdateTaskDto } from './dto/update-task.dto';
import { QueryTasksDto } from './dto/query-tasks.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('tasks')
@ApiBearerAuth()
@Controller('tasks')
@UseGuards(JwtAuthGuard)
export class TasksController {
  constructor(private readonly tasksService: TasksService) {}

  @Post()
  @HttpCode(HttpStatus.CREATED)
  @ApiOperation({ summary: 'Create a new task' })
  @ApiResponse({
    status: 201,
    description: 'Task created successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Task created successfully',
        data: {
          id: 'task-id',
          name: 'Build authentication module',
          estimateHours: 6,
          deadline: '2025-12-30T00:00:00.000Z',
          status: 'PLANNED',
          isActive: false,
          userId: 'user-id',
          createdAt: '2025-12-20T03:00:00.000Z',
        },
        traceId: 'abc123',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Bad request' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  create(@Body() createTaskDto: CreateTaskDto, @CurrentUser() user: any) {
    return this.tasksService.create(createTaskDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all tasks with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Tasks retrieved successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          items: [
            {
              id: 'task-id',
              name: 'Build authentication module',
              estimateHours: 6,
              deadline: '2025-12-30T00:00:00.000Z',
              status: 'ACTIVE',
              isActive: true,
            },
          ],
          meta: {
            itemCount: 1,
            totalItems: 3,
            itemsPerPage: 10,
            totalPages: 1,
            currentPage: 1,
          },
        },
        traceId: 'xyz789',
      },
    },
  })
  findAll(@Query() query: QueryTasksDto, @CurrentUser() user: any) {
    return this.tasksService.findAll(query, user.id);
  }

  @Get('active')
  @ApiOperation({ summary: 'Get active task' })
  @ApiResponse({
    status: 200,
    description: 'Active task retrieved successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          id: 'task-id',
          name: 'Build authentication module',
          estimateHours: 6,
          deadline: '2025-12-30T00:00:00.000Z',
          status: 'ACTIVE',
          isActive: true,
        },
        traceId: 'active123',
      },
    },
  })
  @ApiResponse({
    status: 200,
    description: 'No active task',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'No active task',
        data: null,
        traceId: 'active123',
      },
    },
  })
  findActive(@CurrentUser() user: any) {
    return this.tasksService.findActive(user.id);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get task by ID' })
  @ApiResponse({ status: 200, description: 'Task retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.findOne(id, user.id);
  }

  @Post(':id/activate')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Activate a task (CORE API)' })
  @ApiResponse({
    status: 200,
    description: 'Task activated',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Task activated',
        data: {
          id: 'task-id',
          status: 'ACTIVE',
          isActive: true,
        },
        traceId: 'activate456',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Cannot activate completed task' })
  activate(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.activate(id, user.id);
  }

  @Post(':id/complete')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Complete a task' })
  @ApiResponse({
    status: 200,
    description: 'Task completed',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Task completed',
        data: {
          id: 'task-id',
          status: 'DONE',
          isActive: false,
        },
        traceId: 'complete789',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  complete(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.complete(id, user.id);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update task by ID' })
  @ApiResponse({ status: 200, description: 'Task updated successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(@Param('id') id: string, @Body() updateTaskDto: UpdateTaskDto, @CurrentUser() user: any) {
    return this.tasksService.update(id, updateTaskDto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete task by ID' })
  @ApiResponse({ status: 200, description: 'Task deleted successfully' })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.tasksService.remove(id, user.id);
  }
}

import {
  Controller,
  Get,
  Post,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ExpService } from './exp.service';
import { StartExpTrackingDto } from './dto/start-exp-tracking.dto';
import { PauseExpTrackingDto } from './dto/pause-exp-tracking.dto';
import { ResumeExpTrackingDto } from './dto/resume-exp-tracking.dto';
import { StopExpTrackingDto } from './dto/stop-exp-tracking.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('exp')
@ApiBearerAuth()
@Controller('exp')
@UseGuards(JwtAuthGuard)
export class ExpController {
  constructor(private readonly expService: ExpService) {}

  @Post('start')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Start tracking a task' })
  @ApiResponse({
    status: 200,
    description: 'Task tracking started',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Task tracking started',
        data: {
          trackingId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'active',
          startTime: '2025-12-20T10:00:00Z',
          accumulatedTime: 0,
        },
        traceId: 'start123',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Task not found or already being tracked' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  start(@Body() startDto: StartExpTrackingDto, @CurrentUser() user: any) {
    return this.expService.start(startDto, user.id);
  }

  @Post('pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Pause tracking a task' })
  @ApiResponse({
    status: 200,
    description: 'Task paused',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Task paused',
        data: {
          trackingId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'paused',
          accumulatedTime: 3600,
        },
        traceId: 'pause123',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'No active tracking found' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  pause(@Body() pauseDto: PauseExpTrackingDto, @CurrentUser() user: any) {
    return this.expService.pause(pauseDto, user.id);
  }

  @Post('resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Resume tracking a task' })
  @ApiResponse({
    status: 200,
    description: 'Task resumed',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Task resumed',
        data: {
          trackingId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'active',
          startTime: '2025-12-20T10:30:00Z',
          accumulatedTime: 3600,
        },
        traceId: 'resume123',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Task already active or cannot resume stopped task' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'No tracking found' })
  resume(@Body() resumeDto: ResumeExpTrackingDto, @CurrentUser() user: any) {
    return this.expService.resume(resumeDto, user.id);
  }

  @Post('stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Stop tracking a task and calculate EXP' })
  @ApiResponse({
    status: 200,
    description: 'Task stopped and EXP calculated',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Task stopped and EXP calculated',
        data: {
          trackingId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'stopped',
          accumulatedTime: 7200,
          percentComplete: 50,
          expEarned: 50,
        },
        traceId: 'stop123',
      },
    },
  })
  @ApiResponse({ status: 400, description: 'Task tracking already stopped' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'No tracking found' })
  stop(@Body() stopDto: StopExpTrackingDto, @CurrentUser() user: any) {
    return this.expService.stop(stopDto, user.id);
  }

  @Get('progress/:taskId')
  @ApiOperation({ summary: 'Get progress for a task' })
  @ApiResponse({
    status: 200,
    description: 'Progress retrieved',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Progress retrieved',
        data: {
          trackingId: '550e8400-e29b-41d4-a716-446655440000',
          status: 'active',
          accumulatedTime: 3600,
          percentComplete: 25,
          expEarned: 25,
        },
        traceId: 'progress123',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 404, description: 'Tracking not found' })
  getProgress(@Param('taskId') taskId: string, @CurrentUser() user: any) {
    return this.expService.getProgress(taskId, user.id);
  }
}

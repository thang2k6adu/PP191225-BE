import {
  Controller,
  Get,
  Post,
  Param,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { TrackingService } from './tracking.service';
import { GetProgressDto } from './dto/get-progress.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('tracking-sessions')
@ApiBearerAuth()
@Controller('tracking-sessions')
@UseGuards(JwtAuthGuard)
export class TrackingController {
  constructor(private readonly trackingService: TrackingService) {}

  @Post(':id/pause')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Pause a tracking session (temporary)',
    description: 'Temporarily pause a session. Can be resumed later.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session paused successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Session paused',
        data: {
          id: 'session-id',
          status: 'paused',
          currentDuration: 120,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Session is not active' })
  pause(@Param('id') id: string, @CurrentUser() user: any) {
    return this.trackingService.pause(id, user.id);
  }

  @Post(':id/resume')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Resume a paused session',
    description: 'Resume a previously paused session.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session resumed successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Session resumed',
        data: {
          id: 'session-id',
          status: 'active',
          startTime: '2025-12-25T10:00:00.000Z',
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Session is not paused' })
  resume(@Param('id') id: string, @CurrentUser() user: any) {
    return this.trackingService.resume(id, user.id);
  }

  @Post(':id/stop')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Stop and finalize a session',
    description: 'Stop a session, calculate duration, update task progress. Cannot be resumed.',
  })
  @ApiResponse({
    status: 200,
    description: 'Session stopped successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Session stopped',
        data: {
          id: 'session-id',
          status: 'stopped',
          duration: 300,
          expEarned: 25.5,
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Session not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  @ApiResponse({ status: 400, description: 'Session is already stopped' })
  stop(@Param('id') id: string, @CurrentUser() user: any) {
    return this.trackingService.stop(id, user.id);
  }

  @Get('progress')
  @ApiOperation({
    summary: 'Get task progress with all sessions',
    description: 'Get detailed progress information including all tracking sessions.',
  })
  @ApiResponse({
    status: 200,
    description: 'Progress retrieved successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          progress: 35.5,
          totalTimeSpent: 1278,
          estimateSeconds: 3600,
          expEarned: 35.5,
          sessions: [
            {
              id: 'session-1',
              startTime: '2025-12-25T10:00:00.000Z',
              endTime: '2025-12-25T10:10:00.000Z',
              duration: 600,
              status: 'stopped',
            },
          ],
          currentSession: {
            id: 'session-2',
            startTime: '2025-12-25T10:15:00.000Z',
            status: 'active',
            currentDuration: 678,
          },
        },
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Task not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  getProgress(@Query() query: GetProgressDto, @CurrentUser() user: any) {
    return this.trackingService.getProgress(query, user.id);
  }
}

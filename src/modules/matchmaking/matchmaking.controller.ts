import {
  Controller,
  Post,
  Get,
  Body,
  UseGuards,
  HttpCode,
  HttpStatus,
  ConflictException,
  Inject,
  forwardRef,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingGateway } from './matchmaking.gateway';
import { JoinMatchmakingDto, MatchmakingResponseDto } from './dto/matchmaking.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

/**
 * Matchmaking Controller
 * Handles HTTP API endpoints for matchmaking
 */
@ApiTags('matchmaking')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('matchmaking')
export class MatchmakingController {
  constructor(
    private readonly matchmakingService: MatchmakingService,
    @Inject(forwardRef(() => MatchmakingGateway))
    private readonly matchmakingGateway: MatchmakingGateway,
  ) {}

  /**
   * Join matchmaking queue
   * POST /matchmaking/join
   *
   * Immediately join or create a public room for the topic
   */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join matchmaking for a topic',
    description:
      'Join matchmaking to find a room. You will be matched to an existing public room or a new one will be created for you.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined room',
    type: MatchmakingResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User already in a room',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async joinMatchmaking(
    @Body() dto: JoinMatchmakingDto,
    @CurrentUser() user: any,
  ): Promise<MatchmakingResponseDto> {
    // Validate user is connected via WebSocket
    const socketId = this.matchmakingService.getUserSocketId(user.id);
    if (!socketId) {
      throw new ConflictException('Please connect to WebSocket before joining matchmaking');
    }

    const result = await this.matchmakingService.joinMatchmaking(user.id, dto.topic);

    // Always return room data immediately
    return {
      status: 'MATCHED',
      message: result.isNewRoom ? 'New room created!' : 'Joined existing room!',
      matchData: {
        roomId: result.roomId,
        livekitRoomName: result.livekitRoomName,
        token: result.token,
      },
    };
  }

  /**
   * Cancel matchmaking
   * POST /matchmaking/cancel
   *
   * Note: No queue anymore, users should leave room via /rooms/:roomId/leave endpoint
   */
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel matchmaking (deprecated)',
    description:
      'This endpoint is now deprecated. To leave a room, use the /rooms/:roomId/leave endpoint instead.',
  })
  @ApiResponse({
    status: 200,
    description: 'Message about using leave room endpoint',
  })
  async cancelMatchmaking(@CurrentUser() user: any) {
    await this.matchmakingService.cancelMatchmaking(user.id);

    return {
      message: 'No queue to cancel. Please use /rooms/:roomId/leave endpoint to leave a room.',
    };
  }

  /**
   * Get matchmaking statistics (for debugging/monitoring)
   * GET /matchmaking/stats
   */
  @Get('stats')
  @ApiOperation({
    summary: 'Get matchmaking statistics',
    description: 'Get current matchmaking system statistics (for debugging/monitoring).',
  })
  @ApiResponse({
    status: 200,
    description: 'Matchmaking statistics',
  })
  async getStats() {
    return this.matchmakingService.getStats();
  }
}

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
   * Random matching - find available room or wait in queue
   */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join random matchmaking',
    description:
      'Join an available room if exists, otherwise wait in queue. When enough users are waiting, a new room will be created.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined or waiting',
    type: MatchmakingResponseDto,
  })
  @ApiResponse({
    status: 409,
    description: 'User already in a room or queue',
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

    const result = await this.matchmakingService.joinMatchmaking(user.id);

    if (result.status === 'MATCHED') {
      return {
        status: 'MATCHED',
        message: 'Joined room successfully!',
        matchData: {
          roomId: result.roomId!,
          livekitRoomName: result.livekitRoomName!,
          token: result.token!,
        },
      };
    } else {
      return {
        status: 'WAITING',
        message: 'Waiting for more users...',
      };
    }
  }

  /**
   * Cancel matchmaking
   * POST /matchmaking/cancel
   *
   * Remove user from waiting queue
   */
  @Post('cancel')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Cancel matchmaking',
    description: 'Remove yourself from the matchmaking queue if you are waiting.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully cancelled matchmaking',
  })
  @ApiResponse({
    status: 409,
    description: 'User is not in matchmaking queue',
  })
  async cancelMatchmaking(@CurrentUser() user: any) {
    await this.matchmakingService.cancelMatchmaking(user.id);

    return {
      message: 'You have been removed from matchmaking queue',
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

import {
  Controller,
  Post,
  Get,
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
import { MatchmakingResponseDto } from './dto/matchmaking-response.dto';
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
   * If queue is empty → user waits
   * If someone is waiting → match them together and create room
   */
  @Post('join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({
    summary: 'Join matchmaking queue',
    description:
      'Join matchmaking to find an opponent. If someone is waiting, you will be matched immediately. Otherwise, you will wait for an opponent.',
  })
  @ApiResponse({
    status: 200,
    description: 'Successfully joined matchmaking',
    type: MatchmakingResponseDto,
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          status: 'WAITING',
          message: 'Waiting for opponent...',
        },
        traceId: 'abc123',
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'User already in matchmaking queue or room',
  })
  @ApiResponse({
    status: 401,
    description: 'Unauthorized',
  })
  async joinMatchmaking(@CurrentUser() user: any): Promise<MatchmakingResponseDto> {
    // Validate user is connected via WebSocket
    const socketId = this.matchmakingService.getUserSocketId(user.id);
    if (!socketId) {
      throw new ConflictException('Please connect to WebSocket before joining matchmaking');
    }

    const userName =
      user.firstName && user.lastName ? `${user.firstName} ${user.lastName}` : user.email;

    const result = await this.matchmakingService.joinMatchmaking(user.id, userName);

    if (result.matched) {
      // Match found! Send WebSocket events to both users
      this.matchmakingGateway.sendMatchFound(user.id, result.opponentId!, {
        roomId: result.roomId!,
        opponentId: result.opponentId!,
        opponentName: result.opponentName,
      });

      return {
        status: 'MATCHED',
        message: 'Match found!',
        matchData: {
          roomId: result.roomId!,
          opponentId: result.opponentId!,
          opponentName: result.opponentName,
        },
      };
    } else {
      // Waiting for opponent
      return {
        status: 'WAITING',
        message: 'Waiting for opponent...',
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
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Matchmaking cancelled',
        data: {
          status: 'IDLE',
          message: 'You have been removed from matchmaking queue',
        },
        traceId: 'abc123',
      },
    },
  })
  @ApiResponse({
    status: 409,
    description: 'User is not in matchmaking queue',
  })
  async cancelMatchmaking(@CurrentUser() user: any) {
    this.matchmakingService.cancelMatchmaking(user.id);

    return {
      status: 'IDLE',
      message: 'You have been removed from matchmaking queue',
    };
  }

  /**
   * Get current matchmaking status
   * GET /matchmaking/status
   */
  @Get('status')
  @ApiOperation({
    summary: 'Get current matchmaking status',
    description: 'Get your current state in the matchmaking system (IDLE, WAITING, or IN_ROOM).',
  })
  @ApiResponse({
    status: 200,
    description: 'Current matchmaking status',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          state: 'WAITING',
          room: null,
        },
        traceId: 'abc123',
      },
    },
  })
  async getStatus(@CurrentUser() user: any) {
    const state = this.matchmakingService.getUserState(user.id);
    const room = this.matchmakingService.getUserRoom(user.id);

    return {
      state,
      room: room
        ? {
            roomId: room.roomId,
            players: room.players,
            createdAt: room.createdAt,
          }
        : null,
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

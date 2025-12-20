import { Controller, Get, Post, Param, UseGuards, HttpCode, HttpStatus } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { RoomsService } from './rooms.service';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('rooms')
@ApiBearerAuth()
@UseGuards(JwtAuthGuard)
@Controller('rooms')
export class RoomsController {
  constructor(private readonly roomsService: RoomsService) {}

  @Post('matchmaking/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join matchmaking queue' })
  @ApiResponse({
    status: 200,
    description: 'Joined room successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Joined room successfully',
        data: {
          room: {
            id: 'room-uuid',
            type: 'PUBLIC',
            status: 'WAITING',
            maxMembers: 2,
            members: [
              {
                userId: 'user-1',
                status: 'JOINED',
              },
              {
                userId: 'user-2',
                status: 'JOINED',
              },
            ],
          },
        },
        traceId: 'abc123',
      },
    },
  })
  @ApiResponse({ status: 409, description: 'User already in a room' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async joinMatchmaking(@CurrentUser() user: any) {
    const room = await this.roomsService.joinMatchmaking(user.id);
    return {
      room,
    };
  }

  @Get(':roomId')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get room information' })
  @ApiResponse({
    status: 200,
    description: 'Room information retrieved successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          id: 'room-uuid',
          type: 'PUBLIC',
          status: 'ACTIVE',
          members: [
            {
              userId: 'user-1',
              status: 'READY',
            },
            {
              userId: 'user-2',
              status: 'READY',
            },
          ],
        },
        traceId: 'xyz789',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a member of this room' })
  async findOne(@Param('roomId') roomId: string, @CurrentUser() user: any) {
    return this.roomsService.findOne(roomId, user.id);
  }

  @Post(':roomId/leave')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Leave room' })
  @ApiResponse({
    status: 200,
    description: 'Left room successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Left room successfully',
        data: null,
        traceId: 'leave123',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @ApiResponse({ status: 403, description: 'Forbidden - Not a member of this room' })
  async leave(@Param('roomId') roomId: string, @CurrentUser() user: any) {
    return this.roomsService.leave(roomId, user.id);
  }
}

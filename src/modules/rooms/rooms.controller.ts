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

  @Get('public')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Get all public rooms' })
  @ApiResponse({
    status: 200,
    description: 'Public rooms retrieved successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          rooms: [
            {
              id: 'room-uuid-1',
              type: 'PUBLIC',
              topic: 'math',
              livekitRoomName: 'public-math',
              status: 'ACTIVE',
              maxMembers: 10,
              currentMembers: 3,
            },
            {
              id: 'room-uuid-2',
              type: 'PUBLIC',
              topic: 'coding',
              livekitRoomName: 'public-coding',
              status: 'ACTIVE',
              maxMembers: 10,
              currentMembers: 1,
            },
          ],
        },
        traceId: 'abc123',
      },
    },
  })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async getPublicRooms() {
    const rooms = await this.roomsService.getPublicRooms();
    return { rooms };
  }

  @Post(':roomId/join')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Join a public room' })
  @ApiResponse({
    status: 200,
    description: 'Joined room successfully with LiveKit token',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Joined room successfully',
        data: {
          roomId: 'room-uuid',
          livekitRoomName: 'public-math',
          token: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
          topic: 'math',
        },
        traceId: 'join123',
      },
    },
  })
  @ApiResponse({ status: 404, description: 'Room not found' })
  @ApiResponse({ status: 409, description: 'User already in a room or room is full' })
  @ApiResponse({ status: 403, description: 'Cannot join private room' })
  @ApiResponse({ status: 401, description: 'Unauthorized' })
  async joinRoom(@Param('roomId') roomId: string, @CurrentUser() user: any) {
    return this.roomsService.joinPublicRoom(roomId, user.id);
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

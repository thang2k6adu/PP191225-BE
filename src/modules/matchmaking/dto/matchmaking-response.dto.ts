import { ApiProperty } from '@nestjs/swagger';

/**
 * Response DTO for matchmaking operations
 */
export class MatchmakingResponseDto {
  @ApiProperty({
    example: 'WAITING',
    description: 'Current matchmaking status',
    enum: ['WAITING', 'MATCHED'],
  })
  status: 'WAITING' | 'MATCHED';

  @ApiProperty({
    example: 'Waiting for opponent...',
    description: 'Status message',
  })
  message: string;

  @ApiProperty({
    example: {
      roomId: 'room-uuid-123',
      opponentId: 'opponent-user-id',
    },
    description: 'Match data (only when status is MATCHED)',
    required: false,
  })
  matchData?: {
    roomId: string;
    opponentId: string;
    opponentName?: string;
    livekitToken?: string;
    livekitUrl?: string;
  };
}

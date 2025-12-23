import { ApiProperty } from '@nestjs/swagger';

/**
 * DTO for MATCH_FOUND event payload
 * Sent to both users when matchmaking succeeds
 */
export class MatchFoundDto {
  @ApiProperty({
    example: 'room-uuid-123',
    description: 'Unique room identifier',
  })
  roomId: string;

  @ApiProperty({
    example: 'opponent-user-id',
    description: 'Opponent user ID',
  })
  opponentId: string;

  @ApiProperty({
    example: 'John Doe',
    description: 'Opponent display name',
    required: false,
  })
  opponentName?: string;
}

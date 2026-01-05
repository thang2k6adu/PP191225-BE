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

  @ApiProperty({
    example: 'eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...',
    description: 'LiveKit access token for video room',
    required: false,
  })
  livekitToken?: string;

  @ApiProperty({
    example: 'ws://localhost:7880',
    description: 'LiveKit server URL',
    required: false,
  })
  livekitUrl?: string;
}

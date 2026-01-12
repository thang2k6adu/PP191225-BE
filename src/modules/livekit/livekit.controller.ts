import { Controller, Post, Body, Headers, Logger } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { LiveKitWebhookDto, LiveKitWebhookEvent } from './dto/livekit-webhook.dto';
import { LiveKitService } from '@/common/services/livekit.service';
import { PrismaService } from '@/database/prisma.service';
import { RoomType, RoomStatus } from '@prisma/client';

@ApiTags('livekit')
@Controller('livekit')
export class LiveKitController {
  private readonly logger = new Logger(LiveKitController.name);

  constructor(
    private prismaService: PrismaService,
    private livekitService: LiveKitService,
  ) {}

  @Post('webhook')
  @ApiOperation({ summary: 'LiveKit webhook endpoint' })
  @ApiResponse({ status: 200, description: 'Webhook processed successfully' })
  @ApiResponse({ status: 401, description: 'Invalid webhook signature' })
  async handleWebhook(
    @Headers('authorization') authHeader: string,
    @Body() webhookData: LiveKitWebhookDto,
  ) {
    // TODO: Verify webhook signature
    // const receiver = new WebhookReceiver(apiKey, apiSecret);
    // const event = receiver.receive(body, authHeader);

    this.logger.log(`Received webhook: ${webhookData.event} for room ${webhookData.room?.name}`);

    try {
      switch (webhookData.event) {
        case LiveKitWebhookEvent.PARTICIPANT_LEFT:
          await this.handleParticipantLeft(webhookData);
          break;

        case LiveKitWebhookEvent.ROOM_FINISHED:
          await this.handleRoomFinished(webhookData);
          break;

        case LiveKitWebhookEvent.PARTICIPANT_JOINED:
          await this.handleParticipantJoined(webhookData);
          break;

        default:
          this.logger.log(`Unhandled webhook event: ${webhookData.event}`);
      }

      return { success: true };
    } catch (error) {
      this.logger.error(`Error processing webhook: ${error.message}`, error.stack);
      throw error;
    }
  }

  /**
   * Handle participant left event
   * Check if room is empty and close MATCH rooms
   */
  private async handleParticipantLeft(data: LiveKitWebhookDto) {
    if (!data.room || !data.participant) return;

    const livekitRoomName = data.room.name;
    const participantIdentity = data.participant.identity;

    this.logger.log(
      `Participant ${participantIdentity} left room ${livekitRoomName}. Remaining: ${data.numParticipants || 0}`,
    );

    // Find room in database
    const room = await this.prismaService.room.findUnique({
      where: { livekitRoomName },
      include: {
        members: {
          where: {
            status: { not: 'LEFT' },
          },
        },
      },
    });

    if (!room) {
      this.logger.warn(`Room not found in database: ${livekitRoomName}`);
      return;
    }

    // Update member status
    await this.prismaService.roomMember.updateMany({
      where: {
        roomId: room.id,
        userId: participantIdentity,
      },
      data: {
        status: 'LEFT',
        leftAt: new Date(),
      },
    });

    // If room is empty and it's a MATCH room, close it
    const remainingParticipants = data.numParticipants || 0;
    if (remainingParticipants === 0 && room.type === RoomType.MATCH) {
      this.logger.log(`Closing empty MATCH room: ${livekitRoomName}`);

      await this.prismaService.room.update({
        where: { id: room.id },
        data: {
          status: RoomStatus.CLOSED,
          endedAt: new Date(),
        },
      });

      // Delete LiveKit room
      try {
        await this.livekitService.deleteRoom(livekitRoomName);
        this.logger.log(`Deleted LiveKit room: ${livekitRoomName}`);
      } catch (error) {
        this.logger.error(`Failed to delete LiveKit room: ${error.message}`);
      }
    }

    // PUBLIC rooms remain open even if empty
  }

  /**
   * Handle room finished event
   * Mark room as closed in database
   */
  private async handleRoomFinished(data: LiveKitWebhookDto) {
    if (!data.room) return;

    const livekitRoomName = data.room.name;
    this.logger.log(`Room finished: ${livekitRoomName}`);

    const room = await this.prismaService.room.findUnique({
      where: { livekitRoomName },
    });

    if (!room) {
      this.logger.warn(`Room not found in database: ${livekitRoomName}`);
      return;
    }

    await this.prismaService.room.update({
      where: { id: room.id },
      data: {
        status: RoomStatus.CLOSED,
        endedAt: new Date(),
      },
    });

    this.logger.log(`Room ${livekitRoomName} marked as CLOSED`);
  }

  /**
   * Handle participant joined event
   * Can be used for analytics or future features like auto-converting MATCH to PUBLIC
   */
  private async handleParticipantJoined(data: LiveKitWebhookDto) {
    if (!data.room || !data.participant) return;

    const livekitRoomName = data.room.name;
    const participantIdentity = data.participant.identity;

    this.logger.log(
      `Participant ${participantIdentity} joined room ${livekitRoomName}. Total: ${data.room.numParticipants}`,
    );

    // Optional: Convert MATCH room to PUBLIC when threshold reached
    // Uncomment below to enable this feature
    /*
    const room = await this.prismaService.room.findUnique({
      where: { livekitRoomName },
    });

    if (room && room.type === RoomType.MATCH && room.visibility === 'PRIVATE') {
      const participantCount = data.room.numParticipants;
      const THRESHOLD = 4; // Convert to public when 4+ participants

      if (participantCount >= THRESHOLD) {
        await this.prismaService.room.update({
          where: { id: room.id },
          data: { visibility: 'PUBLIC' },
        });
        this.logger.log(`Converted MATCH room ${livekitRoomName} to PUBLIC`);
      }
    }
    */
  }
}

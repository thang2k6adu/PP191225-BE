import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { AccessToken, RoomServiceClient } from 'livekit-server-sdk';

@Injectable()
export class LiveKitService {
  private readonly logger = new Logger(LiveKitService.name);
  private roomService: RoomServiceClient;
  private apiKey: string;
  private apiSecret: string;
  private livekitUrl: string;

  constructor(private configService: ConfigService) {
    this.apiKey = this.configService.get<string>('livekit.apiKey');
    this.apiSecret = this.configService.get<string>('livekit.apiSecret');
    this.livekitUrl = this.configService.get<string>('livekit.url');

    this.roomService = new RoomServiceClient(this.livekitUrl, this.apiKey, this.apiSecret);
  }

  /**
   * Create a LiveKit room
   */
  async createRoom(
    roomName: string,
    options?: {
      emptyTimeout?: number;
      maxParticipants?: number;
    },
  ): Promise<void> {
    try {
      await this.roomService.createRoom({
        name: roomName,
        emptyTimeout: options?.emptyTimeout || 300, // 5 minutes default
        maxParticipants: options?.maxParticipants || 0, // 0 = unlimited
      });

      this.logger.log(`LiveKit room created: ${roomName}`);
    } catch (error) {
      this.logger.error(`Failed to create LiveKit room: ${error.message}`);
      throw error;
    }
  }

  /**
   * Generate access token for a user to join a room
   */
  async generateToken(
    userId: string,
    roomName: string,
    options?: {
      ttl?: number;
      canPublish?: boolean;
      canSubscribe?: boolean;
      metadata?: string;
    },
  ): Promise<string> {
    const token = new AccessToken(this.apiKey, this.apiSecret, {
      identity: userId,
      ttl: options?.ttl || 7200, // 2 hours default
    });

    token.addGrant({
      roomJoin: true,
      room: roomName,
      canPublish: options?.canPublish ?? true,
      canSubscribe: options?.canSubscribe ?? true,
    });

    if (options?.metadata) {
      token.metadata = options.metadata;
    }

    return token.toJwt();
  }

  /**
   * Delete a LiveKit room
   */
  async deleteRoom(roomName: string): Promise<void> {
    try {
      await this.roomService.deleteRoom(roomName);
      this.logger.log(`LiveKit room deleted: ${roomName}`);
    } catch (error) {
      this.logger.error(`Failed to delete LiveKit room: ${error.message}`);
      throw error;
    }
  }

  /**
   * List participants in a room
   */
  async listParticipants(roomName: string) {
    try {
      const participants = await this.roomService.listParticipants(roomName);
      return participants;
    } catch (error) {
      this.logger.error(`Failed to list participants: ${error.message}`);
      throw error;
    }
  }

  /**
   * Remove a participant from a room
   */
  async removeParticipant(roomName: string, participantIdentity: string): Promise<void> {
    try {
      await this.roomService.removeParticipant(roomName, participantIdentity);
      this.logger.log(`Removed participant ${participantIdentity} from room ${roomName}`);
    } catch (error) {
      this.logger.error(`Failed to remove participant: ${error.message}`);
      throw error;
    }
  }

  /**
   * Get room info
   */
  async getRoomInfo(roomName: string) {
    try {
      const rooms = await this.roomService.listRooms([roomName]);
      return rooms.length > 0 ? rooms[0] : null;
    } catch (error) {
      this.logger.error(`Failed to get room info: ${error.message}`);
      throw error;
    }
  }
}

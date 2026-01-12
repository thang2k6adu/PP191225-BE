import { IsString, IsEnum, IsObject, IsOptional, IsNumber } from 'class-validator';

export enum LiveKitWebhookEvent {
  ROOM_STARTED = 'room_started',
  ROOM_FINISHED = 'room_finished',
  PARTICIPANT_JOINED = 'participant_joined',
  PARTICIPANT_LEFT = 'participant_left',
  TRACK_PUBLISHED = 'track_published',
  TRACK_UNPUBLISHED = 'track_unpublished',
  EGRESS_STARTED = 'egress_started',
  EGRESS_ENDED = 'egress_ended',
  INGRESS_STARTED = 'ingress_started',
  INGRESS_ENDED = 'ingress_ended',
}

export class LiveKitWebhookDto {
  @IsEnum(LiveKitWebhookEvent)
  event: LiveKitWebhookEvent;

  @IsObject()
  @IsOptional()
  room?: {
    sid: string;
    name: string;
    emptyTimeout: number;
    maxParticipants: number;
    creationTime: number;
    metadata: string;
    numParticipants: number;
    numPublishers: number;
    activeRecording: boolean;
  };

  @IsObject()
  @IsOptional()
  participant?: {
    sid: string;
    identity: string;
    state: string;
    tracks: any[];
    metadata: string;
    joinedAt: number;
    name: string;
    version: number;
    permission: any;
    region: string;
  };

  @IsNumber()
  @IsOptional()
  createdAt?: number;

  @IsString()
  @IsOptional()
  id?: string;

  @IsNumber()
  @IsOptional()
  numParticipants?: number;
}

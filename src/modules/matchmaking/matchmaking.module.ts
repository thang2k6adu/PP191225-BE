import { Module, forwardRef } from '@nestjs/common';
import { JwtModule } from '@nestjs/jwt';
import { ConfigModule, ConfigService } from '@nestjs/config';
import { MatchmakingService } from './matchmaking.service';
import { MatchmakingRedisService } from './matchmaking-redis.service';
import { MatchmakingController } from './matchmaking.controller';
import { MatchmakingGateway } from './matchmaking.gateway';
import { PrismaService } from '@/database/prisma.service';
import { LiveKitService } from '@/common/services/livekit.service';
import { RoomsModule } from '../rooms/rooms.module';

/**
 * Matchmaking Module
 * Provides matchmaking functionality with WebSocket support and Redis queue
 */
@Module({
  imports: [
    forwardRef(() => RoomsModule),
    JwtModule.registerAsync({
      imports: [ConfigModule],
      useFactory: async (configService: ConfigService) => ({
        secret: configService.get<string>('jwt.secret'),
      }),
      inject: [ConfigService],
    }),
  ],
  controllers: [MatchmakingController],
  providers: [
    MatchmakingService,
    MatchmakingRedisService,
    MatchmakingGateway,
    PrismaService,
    LiveKitService,
  ],
  exports: [MatchmakingService, MatchmakingGateway],
})
export class MatchmakingModule {}

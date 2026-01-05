import { Module } from '@nestjs/common';
import { RoomsService } from './rooms.service';
import { RoomsController } from './rooms.controller';
import { PrismaService } from '@/database/prisma.service';
import { LiveKitService } from '@/common/services/livekit.service';

@Module({
  controllers: [RoomsController],
  providers: [RoomsService, PrismaService, LiveKitService],
  exports: [RoomsService],
})
export class RoomsModule {}

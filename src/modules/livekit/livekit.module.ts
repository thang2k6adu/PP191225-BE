import { Module } from '@nestjs/common';
import { LiveKitController } from './livekit.controller';
import { LiveKitService } from '@/common/services/livekit.service';
import { PrismaService } from '@/database/prisma.service';

@Module({
  controllers: [LiveKitController],
  providers: [LiveKitService, PrismaService],
})
export class LiveKitModule {}

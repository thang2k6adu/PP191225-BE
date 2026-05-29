import { Module, forwardRef } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { PrismaService } from '@/database/prisma.service';
import { TasksModule } from '../tasks/tasks.module';
import { CacheService } from '@/common/services/cache.service';

@Module({
  imports: [forwardRef(() => TasksModule)],
  controllers: [TrackingController],
  providers: [TrackingService, PrismaService, CacheService],
  exports: [TrackingService],
})
export class TrackingModule {}

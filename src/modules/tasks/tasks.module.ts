import { Module, forwardRef } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaService } from '@/database/prisma.service';
import { TrackingModule } from '../tracking/tracking.module';
import { CacheService } from '@/common/services/cache.service';

@Module({
  imports: [forwardRef(() => TrackingModule)],
  controllers: [TasksController],
  providers: [TasksService, PrismaService, CacheService],
  exports: [TasksService],
})
export class TasksModule {}

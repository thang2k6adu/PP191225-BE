import { Module, forwardRef } from '@nestjs/common';
import { TasksService } from './tasks.service';
import { TasksController } from './tasks.controller';
import { PrismaService } from '@/database/prisma.service';
import { TrackingModule } from '../tracking/tracking.module';

@Module({
  imports: [forwardRef(() => TrackingModule)],
  controllers: [TasksController],
  providers: [TasksService, PrismaService],
  exports: [TasksService],
})
export class TasksModule {}

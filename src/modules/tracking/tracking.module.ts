import { Module, forwardRef } from '@nestjs/common';
import { TrackingService } from './tracking.service';
import { TrackingController } from './tracking.controller';
import { PrismaService } from '@/database/prisma.service';
import { TasksModule } from '../tasks/tasks.module';

@Module({
  imports: [forwardRef(() => TasksModule)],
  controllers: [TrackingController],
  providers: [TrackingService, PrismaService],
  exports: [TrackingService],
})
export class TrackingModule {}

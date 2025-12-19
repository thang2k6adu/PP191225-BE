import { Module } from '@nestjs/common';
import { MetricsService } from './metrics.service';
import { MetricsController } from './metrics.controller';
import { TracingService } from './tracing.service';

@Module({
  controllers: [MetricsController],
  providers: [MetricsService, TracingService],
  exports: [MetricsService, TracingService],
})
export class MonitoringModule {}

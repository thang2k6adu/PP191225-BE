import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation } from '@nestjs/swagger';
import { MetricsService } from './metrics.service';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('monitoring')
@Controller('metrics')
export class MetricsController {
  constructor(private readonly metricsService: MetricsService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Get Prometheus metrics' })
  async getMetrics() {
    const metrics = await this.metricsService.getMetrics();
    return metrics;
  }
}

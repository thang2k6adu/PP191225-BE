import { Controller, Get } from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse } from '@nestjs/swagger';
import { HealthService } from './health.service';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('health')
@Controller('health')
export class HealthController {
  constructor(private readonly healthService: HealthService) {}

  @Public()
  @Get()
  @ApiOperation({ summary: 'Health check endpoint' })
  @ApiResponse({
    status: 200,
    description: 'Health check successful',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          status: 'ok',
          timestamp: '2025-01-29T10:00:00.000Z',
          uptime: 3600,
          database: 'connected',
        },
        traceId: 'VIHOLaKaWe',
      },
    },
  })
  check() {
    return this.healthService.check();
  }
}

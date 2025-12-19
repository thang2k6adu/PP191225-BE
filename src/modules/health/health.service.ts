import { Injectable } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';

@Injectable()
export class HealthService {
  private readonly startTime = Date.now();

  constructor(private prisma: PrismaService) {}

  async check() {
    let databaseStatus = 'disconnected';

    try {
      await this.prisma.$queryRaw`SELECT 1`;
      databaseStatus = 'connected';
    } catch (error) {
      databaseStatus = 'disconnected';
    }

    const uptime = Math.floor((Date.now() - this.startTime) / 1000);

    return {
      status: 'ok',
      timestamp: new Date().toISOString(),
      uptime,
      database: databaseStatus,
    };
  }
}

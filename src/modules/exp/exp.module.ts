import { Module } from '@nestjs/common';
import { ExpService } from './exp.service';
import { ExpController } from './exp.controller';
import { PrismaService } from '@/database/prisma.service';

@Module({
  controllers: [ExpController],
  providers: [ExpService, PrismaService],
  exports: [ExpService],
})
export class ExpModule {}

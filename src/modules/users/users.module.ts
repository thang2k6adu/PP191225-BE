import { Module } from '@nestjs/common';
import { UsersService } from './users.service';
import { UsersController } from './users.controller';
import { PrismaService } from '@/database/prisma.service';
import { CacheService } from '@/common/services/cache.service';

@Module({
  controllers: [UsersController],
  providers: [UsersService, PrismaService, CacheService],
  exports: [UsersService],
})
export class UsersModule {}

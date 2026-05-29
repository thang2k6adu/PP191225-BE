import { Injectable, NotFoundException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { getPaginationOptions, paginate } from '@/common/utils/pagination.util';
import { PaginatedList } from '@/common/interfaces/api-response.interface';
import { CacheService } from '@/common/services/cache.service';
import { CacheKeys, CacheTTL } from '@/common/utils/cache-key.util';
import { ConflictException } from '@nestjs/common/exceptions/conflict.exception';

const PROFILE_SELECT = {
  id: true,
  email: true,
  contactEmail: true,
  firstName: true,
  lastName: true,
  avatar: true,
  work: true,
  major: true,
  bio: true,
  role: true,
  isActive: true,
  createdAt: true,
  updatedAt: true,
} as const;

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

  async getUserTotalExp(userId: string): Promise<number> {
    const result = await this.prisma.trackingSession.aggregate({
      where: { userId },
      _sum: { expEarned: true },
    });

    return result._sum.expEarned ?? 0;
  }

  private async withExp<T extends Record<string, unknown>>(user: T, userId: string) {
    const exp = await this.getUserTotalExp(userId);
    return { ...user, exp };
  }

  async invalidateProfileCache(userId: string): Promise<void> {
    await this.cacheService.del(CacheKeys.users.profile(userId));
  }

  async create(createUserDto: CreateUserDto) {
    const existingUser = await this.prisma.user.findUnique({
      where: { email: createUserDto.email },
    });

    if (existingUser) {
      throw new ConflictException('User with this email already exists');
    }

    const hashedPassword = await bcrypt.hash(createUserDto.password, 10);

    const user = await this.prisma.user.create({
      data: {
        email: createUserDto.email,
        contactEmail: createUserDto.contactEmail,
        password: hashedPassword,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
      },
      select: {
        id: true,
        email: true,
        contactEmail: true,
        firstName: true,
        lastName: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.cacheService.invalidatePattern(CacheKeys.users.listPattern());

    return user;
  }

  async findAll(query: QueryUsersDto): Promise<PaginatedList<any>> {
    const cacheKey = CacheKeys.users.list(query);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const { skip, take, page, size } = getPaginationOptions(query.page, query.size);

        const where = query.search
          ? {
              OR: [
                { email: { contains: query.search, mode: 'insensitive' as const } },
                {
                  firstName: { contains: query.search, mode: 'insensitive' as const },
                },
                {
                  lastName: { contains: query.search, mode: 'insensitive' as const },
                },
              ],
            }
          : {};

        const [users, total] = await Promise.all([
          this.prisma.user.findMany({
            where,
            skip,
            take,
            select: {
              id: true,
              email: true,
              contactEmail: true,
              firstName: true,
              lastName: true,
              role: true,
              isActive: true,
              createdAt: true,
              updatedAt: true,
            },
            orderBy: { createdAt: 'desc' },
          }),
          this.prisma.user.count({ where }),
        ]);

        return paginate(users, total, page, size);
      },
      CacheTTL.userList,
    );
  }

  async findOne(id: string) {
    const cacheKey = CacheKeys.users.detail(id);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const user = await this.prisma.user.findUnique({
          where: { id },
          select: {
            id: true,
            email: true,
            contactEmail: true,
            firstName: true,
            lastName: true,
            avatar: true,
            work: true,
            major: true,
            bio: true,
            role: true,
            isActive: true,
            createdAt: true,
            updatedAt: true,
          },
        });

        if (!user) {
          throw new NotFoundException('User not found');
        }

        return user;
      },
      CacheTTL.userDetail,
    );
  }

  async update(id: string, updateUserDto: UpdateUserDto) {
    await this.findOne(id);

    const updateData: any = {
      contactEmail: updateUserDto.contactEmail,
      firstName: updateUserDto.firstName,
      lastName: updateUserDto.lastName,
      avatar: updateUserDto.avatar,
      work: updateUserDto.work,
      major: updateUserDto.major,
      bio: updateUserDto.bio,
    };

    if (updateUserDto.password) {
      updateData.password = await bcrypt.hash(updateUserDto.password, 10);
    }

    const updatedUser = await this.prisma.user.update({
      where: { id },
      data: updateData,
      select: {
        id: true,
        email: true,
        contactEmail: true,
        firstName: true,
        lastName: true,
        avatar: true,
        work: true,
        major: true,
        bio: true,
        role: true,
        isActive: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    await this.cacheService.del(CacheKeys.users.detail(id));
    await this.cacheService.del(CacheKeys.users.profile(id));
    await this.cacheService.invalidatePattern(CacheKeys.users.listPattern());

    return updatedUser;
  }

  async remove(id: string) {
    await this.findOne(id);

    await this.prisma.user.delete({
      where: { id },
    });

    await this.cacheService.del(CacheKeys.users.detail(id));
    await this.cacheService.del(CacheKeys.users.profile(id));
    // Vidu user list page 1, page 2,...
    await this.cacheService.invalidatePattern(CacheKeys.users.listPattern());

    return { message: 'User deleted successfully' };
  }

  async getProfile(userId: string) {
    const cacheKey = CacheKeys.users.profile(userId);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const user = await this.prisma.user.findUnique({
          where: { id: userId },
          select: PROFILE_SELECT,
        });

        if (!user) {
          throw new NotFoundException('User not found');
        }

        return this.withExp(user, userId);
      },
      CacheTTL.userProfile,
    );
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    const user = await this.update(userId, updateUserDto);
    return this.withExp(user, userId);
  }
}

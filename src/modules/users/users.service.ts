import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '@/database/prisma.service';
import { CreateUserDto } from './dto/create-user.dto';
import { UpdateUserDto } from './dto/update-user.dto';
import { QueryUsersDto } from './dto/query-users.dto';
import { getPaginationOptions, paginate } from '@/common/utils/pagination.util';
import { PaginatedResponse } from '@/common/interfaces/api-response.interface';
import { CacheService } from '@/common/services/cache.service';
import { CacheKeys, CacheTTL } from '@/common/utils/cache-key.util';

@Injectable()
export class UsersService {
  constructor(
    private prisma: PrismaService,
    private cacheService: CacheService,
  ) {}

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
        password: hashedPassword,
        firstName: createUserDto.firstName,
        lastName: createUserDto.lastName,
      },
      select: {
        id: true,
        email: true,
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

  async findAll(query: QueryUsersDto): Promise<PaginatedResponse<any>> {
    const cacheKey = CacheKeys.users.list(query);

    return this.cacheService.getOrSet(
      cacheKey,
      async () => {
        const { skip, take, page, limit } = getPaginationOptions(query.page, query.limit);

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

        return paginate(users, total, page, limit);
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
    const user = await this.findOne(id);

    if (updateUserDto.email && updateUserDto.email !== user.email) {
      const existingUser = await this.prisma.user.findUnique({
        where: { email: updateUserDto.email },
      });

      if (existingUser) {
        throw new ConflictException('User with this email already exists');
      }
    }

    const updateData: any = {
      email: updateUserDto.email,
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

    return this.cacheService.getOrSet(cacheKey, () => this.findOne(userId), CacheTTL.userProfile);
  }

  async updateProfile(userId: string, updateUserDto: UpdateUserDto) {
    return this.update(userId, updateUserDto);
  }
}

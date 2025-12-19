# Coding Guide - Workflow cho Feature Development

Hướng dẫn chi tiết về workflow code khi implement một feature mới trong NestJS Boilerplate.

## 📋 Mục Lục

1. [Tổng Quan Workflow](#tổng-quan-workflow)
2. [Chi Tiết Từng Bước](#chi-tiết-từng-bước)
3. [Ví Dụ Cụ Thể: Products Feature](#ví-dụ-cụ-thể-products-feature)
4. [Best Practices](#best-practices)
5. [Checklist](#checklist)

---

## 🎯 Tổng Quan Workflow

Khi implement một feature mới, hãy làm theo thứ tự sau:

```
1. Prisma Schema (Nếu cần database)
   ↓
2. DTOs (Data Transfer Objects)
   ↓
3. Service Layer (Business Logic)
   ↓
4. Controller (API Endpoints)
   ↓
5. Module (Dependency Injection)
   ↓
6. Đăng ký Module trong AppModule
   ↓
7. Tests (Unit & E2E)
```

---

## 📝 Chi Tiết Từng Bước

### BƯỚC 1: Cập nhật Prisma Schema (Nếu cần database)

**📍 Location:** `prisma/schema.prisma`

**Mục đích:** Định nghĩa database schema cho feature mới

**Cấu trúc:**

```prisma
model Product {
  id          String   @id @default(uuid())
  name        String
  description String?
  price       Decimal  @db.Decimal(10, 2)
  stock       Int      @default(0)
  isActive    Boolean  @default(true)
  userId      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("products")
  @@index([userId])
  @@index([isActive])
}
```

**⚠️ Lưu ý:**

- Sau khi cập nhật schema, chạy:
  ```bash
  npm run prisma:generate
  npm run prisma:migrate
  ```
- Sử dụng `@@map` để đặt tên table theo convention (snake_case)
- Thêm indexes cho các trường thường query
- Sử dụng `@default()` cho giá trị mặc định
- Sử dụng `@updatedAt` cho trường tự động cập nhật
- Sử dụng `onDelete: Cascade` cho foreign keys khi cần

---

### BƯỚC 2: Tạo DTOs (Data Transfer Objects)

**📍 Location:** `src/modules/[featureName]/dto/`

**Mục đích:** Định nghĩa validation và types cho request/response

**Cấu trúc:**

#### Create DTO (`create-[feature].dto.ts`)

```typescript
import { ApiProperty } from '@nestjs/swagger';
import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsNumber,
  IsBoolean,
  Min,
  MaxLength,
} from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Laptop Dell XPS 13' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'High-performance laptop', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1299.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  stock: number;
}
```

#### Update DTO (`update-[feature].dto.ts`)

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsEmail, IsOptional, IsString, MinLength } from 'class-validator';

export class UpdateProductDto {
  @ApiProperty({ example: 'Laptop Dell XPS 13', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'High-performance laptop', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1299.99, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  price?: number;

  @ApiProperty({ example: 10, required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
```

**Lưu ý:** Có thể sử dụng `PartialType` từ `@nestjs/swagger` nếu muốn extend từ CreateDto:

```typescript
import { PartialType } from '@nestjs/swagger';
import { CreateProductDto } from './create-product.dto';

export class UpdateProductDto extends PartialType(CreateProductDto) {
  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
```

#### Query DTO (`query-[feature].dto.ts`)

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryProductsDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({ example: 'laptop', required: false })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;
}
```

**⚠️ Lưu ý:**

- Luôn sử dụng `@ApiProperty` cho Swagger documentation
- Sử dụng `class-validator` decorators cho validation
- Sử dụng `@Type()` từ `class-transformer` cho query parameters (Number, Boolean)
- Đặt default values cho query parameters
- Sử dụng `@Max()` để giới hạn giá trị (ví dụ: limit tối đa 100)

---

### BƯỚC 3: Tạo Service Layer (Business Logic)

**📍 Location:** `src/modules/[featureName]/[featureName].service.ts`

**Mục đích:** Chứa business logic, database operations

**Cấu trúc:**

```typescript
import {
  Injectable,
  NotFoundException,
  ConflictException,
  ForbiddenException,
} from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { getPaginationOptions, paginate } from '@/common/utils/pagination.util';
import { PaginatedResponse } from '@/common/interfaces/api-response.interface';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto, userId: string) {
    const product = await this.prisma.product.create({
      data: {
        ...createProductDto,
        userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return product;
  }

  async findAll(query: QueryProductsDto, userId?: string): Promise<PaginatedResponse<any>> {
    const { skip, take, page, limit } = getPaginationOptions(query.page, query.limit);

    const where: any = {};

    // Filter by user if not admin
    if (userId) {
      where.userId = userId;
    }

    // Search filter
    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { description: { contains: query.search, mode: 'insensitive' as const } },
      ];
    }

    // Active filter
    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          stock: true,
          isActive: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginate(products, total, page, limit);
  }

  async findOne(id: string, userId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    // Check ownership if not admin
    if (userId && product.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this product');
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, userId: string) {
    const product = await this.findOne(id, userId);

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedProduct;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    await this.prisma.product.delete({
      where: { id },
    });

    return { message: 'Product deleted successfully' };
  }
}
```

**⚠️ Lưu ý:**

- Luôn sử dụng `select` để chỉ lấy các trường cần thiết (không bao gồm password, sensitive data)
- Sử dụng `Promise.all()` cho parallel queries
- Handle errors với NestJS exceptions (`NotFoundException`, `ConflictException`, etc.)
- Implement authorization checks trong service
- Sử dụng pagination utilities từ `@/common/utils/pagination.util`
- Luôn validate ownership trước khi update/delete
- Sử dụng `mode: 'insensitive'` cho case-insensitive search

---

### BƯỚC 4: Tạo Controller (API Endpoints)

**📍 Location:** `src/modules/[featureName]/[featureName].controller.ts`

**Mục đích:** Định nghĩa API endpoints, routing, guards, decorators

**Cấu trúc:**

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { Roles } from '@/common/decorators/roles.decorator';
import { CurrentUser } from '@/common/decorators/current-user.decorator';
import { Public } from '@/common/decorators/public.decorator';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  @ApiResponse({ status: 400, description: 'Bad request' })
  create(@Body() createProductDto: CreateProductDto, @CurrentUser() user: any) {
    return this.productsService.create(createProductDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products with pagination' })
  @ApiResponse({
    status: 200,
    description: 'Products retrieved successfully',
    schema: {
      example: {
        error: false,
        code: 0,
        message: 'Success',
        data: {
          items: [],
          meta: {
            itemCount: 0,
            totalItems: 0,
            itemsPerPage: 10,
            totalPages: 1,
            currentPage: 1,
          },
        },
        traceId: 'VIHOLaKaWe',
      },
    },
  })
  findAll(@Query() query: QueryProductsDto, @CurrentUser() user: any) {
    // Admin can see all products, users can only see their own
    const userId = user.role === 'ADMIN' ? undefined : user.id;
    return this.productsService.findAll(query, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const userId = user.role === 'ADMIN' ? undefined : user.id;
    return this.productsService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product by ID' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.update(id, updateProductDto, user.id);
  }

  @Delete(':id')
  @HttpCode(HttpStatus.OK)
  @ApiOperation({ summary: 'Delete product by ID' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  @ApiResponse({ status: 404, description: 'Product not found' })
  @ApiResponse({ status: 403, description: 'Forbidden' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productsService.remove(id, user.id);
  }
}
```

**⚠️ Lưu ý:**

- Luôn sử dụng `@ApiTags` để group endpoints trong Swagger
- Sử dụng `@ApiBearerAuth()` cho protected routes
- Sử dụng `@UseGuards(JwtAuthGuard, RolesGuard)` cho authentication/authorization
- Sử dụng `@Roles()` decorator để restrict routes (ví dụ: `@Roles('ADMIN')`)
- Sử dụng `@CurrentUser()` decorator để lấy current user
- Sử dụng `@Public()` decorator cho public routes (nếu cần)
- Sử dụng `@ApiOperation` và `@ApiResponse` cho Swagger documentation
- Implement proper HTTP status codes (`@HttpCode()`)
- Controller chỉ nên gọi service methods, không chứa business logic

---

### BƯỚC 5: Tạo Module (Dependency Injection)

**📍 Location:** `src/modules/[featureName]/[featureName].module.ts`

**Mục đích:** Đăng ký providers, controllers, imports, exports

**Cấu trúc:**

```typescript
import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaService } from '@/database/prisma.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PrismaService],
  exports: [ProductsService], // Export nếu module khác cần dùng
})
export class ProductsModule {}
```

**Nếu cần import modules khác:**

```typescript
import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaService } from '@/database/prisma.service';
import { MailModule } from '../mail/mail.module';
import { NotificationsModule } from '../notifications/notifications.module';

@Module({
  imports: [MailModule, NotificationsModule],
  controllers: [ProductsController],
  providers: [ProductsService, PrismaService],
  exports: [ProductsService],
})
export class ProductsModule {}
```

**⚠️ Lưu ý:**

- Import các modules khác nếu cần (ví dụ: `MailModule`, `NotificationsModule`)
- Export service nếu module khác cần sử dụng
- Luôn include `PrismaService` trong providers nếu dùng database

---

### BƯỚC 6: Đăng ký Module trong AppModule

**📍 Location:** `src/app.module.ts`

**Mục đích:** Đăng ký module mới vào application

**Cấu trúc:**

```typescript
import { ProductsModule } from './modules/products/products.module';

@Module({
  imports: [
    // ... existing modules
    AuthModule,
    UsersModule,
    HealthModule,
    ProductsModule, // Thêm module mới
    // ... other modules
  ],
  // ...
})
export class AppModule {}
```

**⚠️ Lưu ý:**

- Thêm module vào `imports` array
- Đặt theo thứ tự logic (auth modules trước, feature modules sau)

---

### BƯỚC 7: Viết Tests

**📍 Location:** `src/modules/[featureName]/[featureName].service.spec.ts` và `test/[feature].e2e-spec.ts`

**Mục đích:** Đảm bảo code hoạt động đúng

#### Unit Test (Service)

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { ProductsService } from './products.service';
import { PrismaService } from '@/database/prisma.service';
import { NotFoundException, ForbiddenException } from '@nestjs/common';

describe('ProductsService', () => {
  let service: ProductsService;
  let prisma: PrismaService;

  const mockPrismaService = {
    product: {
      create: jest.fn(),
      findMany: jest.fn(),
      findUnique: jest.fn(),
      update: jest.fn(),
      delete: jest.fn(),
      count: jest.fn(),
    },
  };

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [
        ProductsService,
        {
          provide: PrismaService,
          useValue: mockPrismaService,
        },
      ],
    }).compile();

    service = module.get<ProductsService>(ProductsService);
    prisma = module.get<PrismaService>(PrismaService);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  it('should be defined', () => {
    expect(service).toBeDefined();
  });

  describe('create', () => {
    it('should create a product', async () => {
      const createProductDto = {
        name: 'Test Product',
        description: 'Test Description',
        price: 100,
        stock: 10,
      };
      const userId = 'user-id';

      const expectedProduct = {
        id: 'product-id',
        ...createProductDto,
        isActive: true,
        userId,
        createdAt: new Date(),
        updatedAt: new Date(),
      };

      mockPrismaService.product.create.mockResolvedValue(expectedProduct);

      const result = await service.create(createProductDto, userId);

      expect(result).toEqual(expectedProduct);
      expect(mockPrismaService.product.create).toHaveBeenCalledWith({
        data: {
          ...createProductDto,
          userId,
        },
        select: expect.any(Object),
      });
    });
  });

  describe('findOne', () => {
    it('should return a product', async () => {
      const productId = 'product-id';
      const expectedProduct = {
        id: productId,
        name: 'Test Product',
        userId: 'user-id',
      };

      mockPrismaService.product.findUnique.mockResolvedValue(expectedProduct);

      const result = await service.findOne(productId);

      expect(result).toEqual(expectedProduct);
      expect(mockPrismaService.product.findUnique).toHaveBeenCalledWith({
        where: { id: productId },
        select: expect.any(Object),
      });
    });

    it('should throw NotFoundException if product not found', async () => {
      mockPrismaService.product.findUnique.mockResolvedValue(null);

      await expect(service.findOne('non-existent-id')).rejects.toThrow(NotFoundException);
    });

    it('should throw ForbiddenException if user does not own product', async () => {
      const product = {
        id: 'product-id',
        userId: 'other-user-id',
      };

      mockPrismaService.product.findUnique.mockResolvedValue(product);

      await expect(service.findOne('product-id', 'user-id')).rejects.toThrow(ForbiddenException);
    });
  });

  describe('update', () => {
    it('should update a product', async () => {
      const productId = 'product-id';
      const userId = 'user-id';
      const updateDto = { name: 'Updated Product' };

      const existingProduct = {
        id: productId,
        userId,
        name: 'Old Product',
      };

      const updatedProduct = {
        ...existingProduct,
        ...updateDto,
      };

      mockPrismaService.product.findUnique.mockResolvedValue(existingProduct);
      mockPrismaService.product.update.mockResolvedValue(updatedProduct);

      const result = await service.update(productId, updateDto, userId);

      expect(result).toEqual(updatedProduct);
      expect(mockPrismaService.product.update).toHaveBeenCalledWith({
        where: { id: productId },
        data: updateDto,
        select: expect.any(Object),
      });
    });
  });

  describe('remove', () => {
    it('should delete a product', async () => {
      const productId = 'product-id';
      const userId = 'user-id';

      const existingProduct = {
        id: productId,
        userId,
      };

      mockPrismaService.product.findUnique.mockResolvedValue(existingProduct);
      mockPrismaService.product.delete.mockResolvedValue(existingProduct);

      const result = await service.remove(productId, userId);

      expect(result).toEqual({ message: 'Product deleted successfully' });
      expect(mockPrismaService.product.delete).toHaveBeenCalledWith({
        where: { id: productId },
      });
    });
  });
});
```

#### E2E Test

```typescript
import { Test, TestingModule } from '@nestjs/testing';
import { INestApplication } from '@nestjs/common';
import * as request from 'supertest';
import { AppModule } from './../src/app.module';

describe('ProductsController (e2e)', () => {
  let app: INestApplication;
  let accessToken: string;
  let userId: string;

  beforeAll(async () => {
    const moduleFixture: TestingModule = await Test.createTestingModule({
      imports: [AppModule],
    }).compile();

    app = moduleFixture.createNestApplication();
    await app.init();

    // Register a test user
    const registerResponse = await request(app.getHttpServer()).post('/api/auth/register').send({
      email: 'test@example.com',
      password: 'password123',
      firstName: 'Test',
      lastName: 'User',
    });

    userId = registerResponse.body.data.user.id;

    // Login to get access token
    const loginResponse = await request(app.getHttpServer()).post('/api/auth/login').send({
      email: 'test@example.com',
      password: 'password123',
    });

    accessToken = loginResponse.body.data.accessToken;
  });

  afterAll(async () => {
    await app.close();
  });

  describe('/products (POST)', () => {
    it('should create a product', () => {
      return request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Test Product',
          description: 'Test Description',
          price: 100,
          stock: 10,
        })
        .expect(201)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('id');
          expect(res.body.data.name).toBe('Test Product');
          expect(res.body.data.price).toBe(100);
        });
    });

    it('should return 400 if validation fails', () => {
      return request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: '', // Invalid: empty name
          price: -10, // Invalid: negative price
        })
        .expect(400);
    });
  });

  describe('/products (GET)', () => {
    it('should return paginated products', () => {
      return request(app.getHttpServer())
        .get('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data).toHaveProperty('items');
          expect(res.body.data).toHaveProperty('meta');
          expect(res.body.data.meta).toHaveProperty('totalItems');
          expect(res.body.data.meta).toHaveProperty('currentPage');
        });
    });

    it('should filter products by search query', () => {
      return request(app.getHttpServer())
        .get('/api/products?search=test')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.items).toBeInstanceOf(Array);
        });
    });
  });

  describe('/products/:id (GET)', () => {
    let productId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Get Test Product',
          price: 200,
          stock: 5,
        });

      productId = createResponse.body.data.id;
    });

    it('should return a product by ID', () => {
      return request(app.getHttpServer())
        .get(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.id).toBe(productId);
          expect(res.body.data.name).toBe('Get Test Product');
        });
    });

    it('should return 404 if product not found', () => {
      return request(app.getHttpServer())
        .get('/api/products/non-existent-id')
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(404);
    });
  });

  describe('/products/:id (PATCH)', () => {
    let productId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Update Test Product',
          price: 300,
          stock: 15,
        });

      productId = createResponse.body.data.id;
    });

    it('should update a product', () => {
      return request(app.getHttpServer())
        .patch(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Updated Product Name',
          price: 350,
        })
        .expect(200)
        .expect((res) => {
          expect(res.body.data.name).toBe('Updated Product Name');
          expect(res.body.data.price).toBe(350);
        });
    });
  });

  describe('/products/:id (DELETE)', () => {
    let productId: string;

    beforeAll(async () => {
      const createResponse = await request(app.getHttpServer())
        .post('/api/products')
        .set('Authorization', `Bearer ${accessToken}`)
        .send({
          name: 'Delete Test Product',
          price: 400,
          stock: 20,
        });

      productId = createResponse.body.data.id;
    });

    it('should delete a product', () => {
      return request(app.getHttpServer())
        .delete(`/api/products/${productId}`)
        .set('Authorization', `Bearer ${accessToken}`)
        .expect(200)
        .expect((res) => {
          expect(res.body.data.message).toBe('Product deleted successfully');
        });
    });
  });
});
```

**⚠️ Lưu ý:**

- Viết tests cho tất cả methods trong service
- Test cả success và error cases
- Sử dụng mocks cho PrismaService trong unit tests
- E2E tests nên test full flow với authentication
- Clean up sau mỗi test với `afterEach` hoặc `afterAll`
- Sử dụng `beforeAll` để setup test data nếu cần

---

## 🎯 Ví Dụ Cụ Thể: Products Feature

Dưới đây là ví dụ đầy đủ cho Products Feature (tham khảo cấu trúc Users module hiện có):

### 1. Prisma Schema (`prisma/schema.prisma`)

```prisma
model Product {
  id          String   @id @default(uuid())
  name        String
  description String?
  price       Decimal  @db.Decimal(10, 2)
  stock       Int      @default(0)
  isActive    Boolean  @default(true)
  userId      String
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  user User @relation(fields: [userId], references: [id], onDelete: Cascade)

  @@map("products")
  @@index([userId])
  @@index([isActive])
}
```

### 2. DTOs

#### `create-product.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsNotEmpty, IsOptional, IsNumber, Min, MaxLength } from 'class-validator';

export class CreateProductDto {
  @ApiProperty({ example: 'Laptop Dell XPS 13' })
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  name: string;

  @ApiProperty({ example: 'High-performance laptop', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1299.99 })
  @IsNumber({ maxDecimalPlaces: 2 })
  @Min(0)
  price: number;

  @ApiProperty({ example: 10 })
  @IsNumber()
  @Min(0)
  stock: number;
}
```

#### `update-product.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsString, IsOptional, IsNumber, IsBoolean, Min } from 'class-validator';

export class UpdateProductDto {
  @ApiProperty({ example: 'Laptop Dell XPS 13', required: false })
  @IsString()
  @IsOptional()
  name?: string;

  @ApiProperty({ example: 'High-performance laptop', required: false })
  @IsString()
  @IsOptional()
  description?: string;

  @ApiProperty({ example: 1299.99, required: false })
  @IsNumber({ maxDecimalPlaces: 2 })
  @IsOptional()
  @Min(0)
  price?: number;

  @ApiProperty({ example: 10, required: false })
  @IsNumber()
  @IsOptional()
  @Min(0)
  stock?: number;

  @ApiProperty({ example: true, required: false })
  @IsBoolean()
  @IsOptional()
  isActive?: boolean;
}
```

#### `query-products.dto.ts`

```typescript
import { ApiProperty } from '@nestjs/swagger';
import { IsOptional, IsString, IsInt, Min, Max, IsBoolean } from 'class-validator';
import { Type } from 'class-transformer';

export class QueryProductsDto {
  @ApiProperty({ required: false, default: 1, minimum: 1 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  page?: number = 1;

  @ApiProperty({ required: false, default: 10, minimum: 1, maximum: 100 })
  @IsOptional()
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @Max(100)
  limit?: number = 10;

  @ApiProperty({ example: 'laptop', required: false })
  @IsString()
  @IsOptional()
  search?: string;

  @ApiProperty({ example: true, required: false })
  @IsOptional()
  @Type(() => Boolean)
  isActive?: boolean;
}
```

### 3. Service (`products.service.ts`)

```typescript
import { Injectable, NotFoundException, ForbiddenException } from '@nestjs/common';
import { PrismaService } from '@/database/prisma.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { getPaginationOptions, paginate } from '@/common/utils/pagination.util';
import { PaginatedResponse } from '@/common/interfaces/api-response.interface';

@Injectable()
export class ProductsService {
  constructor(private prisma: PrismaService) {}

  async create(createProductDto: CreateProductDto, userId: string) {
    const product = await this.prisma.product.create({
      data: {
        ...createProductDto,
        userId,
      },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return product;
  }

  async findAll(query: QueryProductsDto, userId?: string): Promise<PaginatedResponse<any>> {
    const { skip, take, page, limit } = getPaginationOptions(query.page, query.limit);

    const where: any = {};

    if (userId) {
      where.userId = userId;
    }

    if (query.search) {
      where.OR = [
        { name: { contains: query.search, mode: 'insensitive' as const } },
        { description: { contains: query.search, mode: 'insensitive' as const } },
      ];
    }

    if (query.isActive !== undefined) {
      where.isActive = query.isActive;
    }

    const [products, total] = await Promise.all([
      this.prisma.product.findMany({
        where,
        skip,
        take,
        select: {
          id: true,
          name: true,
          description: true,
          price: true,
          stock: true,
          isActive: true,
          userId: true,
          createdAt: true,
          updatedAt: true,
        },
        orderBy: { createdAt: 'desc' },
      }),
      this.prisma.product.count({ where }),
    ]);

    return paginate(products, total, page, limit);
  }

  async findOne(id: string, userId?: string) {
    const product = await this.prisma.product.findUnique({
      where: { id },
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    if (!product) {
      throw new NotFoundException('Product not found');
    }

    if (userId && product.userId !== userId) {
      throw new ForbiddenException('You do not have permission to access this product');
    }

    return product;
  }

  async update(id: string, updateProductDto: UpdateProductDto, userId: string) {
    await this.findOne(id, userId);

    const updatedProduct = await this.prisma.product.update({
      where: { id },
      data: updateProductDto,
      select: {
        id: true,
        name: true,
        description: true,
        price: true,
        stock: true,
        isActive: true,
        userId: true,
        createdAt: true,
        updatedAt: true,
      },
    });

    return updatedProduct;
  }

  async remove(id: string, userId: string) {
    await this.findOne(id, userId);

    await this.prisma.product.delete({
      where: { id },
    });

    return { message: 'Product deleted successfully' };
  }
}
```

### 4. Controller (`products.controller.ts`)

```typescript
import {
  Controller,
  Get,
  Post,
  Body,
  Patch,
  Param,
  Delete,
  Query,
  UseGuards,
} from '@nestjs/common';
import { ApiTags, ApiOperation, ApiResponse, ApiBearerAuth } from '@nestjs/swagger';
import { ProductsService } from './products.service';
import { CreateProductDto } from './dto/create-product.dto';
import { UpdateProductDto } from './dto/update-product.dto';
import { QueryProductsDto } from './dto/query-products.dto';
import { JwtAuthGuard } from '@/common/guards/jwt-auth.guard';
import { RolesGuard } from '@/common/guards/roles.guard';
import { CurrentUser } from '@/common/decorators/current-user.decorator';

@ApiTags('products')
@ApiBearerAuth()
@Controller('products')
@UseGuards(JwtAuthGuard, RolesGuard)
export class ProductsController {
  constructor(private readonly productsService: ProductsService) {}

  @Post()
  @ApiOperation({ summary: 'Create a new product' })
  @ApiResponse({ status: 201, description: 'Product created successfully' })
  create(@Body() createProductDto: CreateProductDto, @CurrentUser() user: any) {
    return this.productsService.create(createProductDto, user.id);
  }

  @Get()
  @ApiOperation({ summary: 'Get all products with pagination' })
  @ApiResponse({ status: 200, description: 'Products retrieved successfully' })
  findAll(@Query() query: QueryProductsDto, @CurrentUser() user: any) {
    const userId = user.role === 'ADMIN' ? undefined : user.id;
    return this.productsService.findAll(query, userId);
  }

  @Get(':id')
  @ApiOperation({ summary: 'Get product by ID' })
  @ApiResponse({ status: 200, description: 'Product retrieved successfully' })
  findOne(@Param('id') id: string, @CurrentUser() user: any) {
    const userId = user.role === 'ADMIN' ? undefined : user.id;
    return this.productsService.findOne(id, userId);
  }

  @Patch(':id')
  @ApiOperation({ summary: 'Update product by ID' })
  @ApiResponse({ status: 200, description: 'Product updated successfully' })
  update(
    @Param('id') id: string,
    @Body() updateProductDto: UpdateProductDto,
    @CurrentUser() user: any,
  ) {
    return this.productsService.update(id, updateProductDto, user.id);
  }

  @Delete(':id')
  @ApiOperation({ summary: 'Delete product by ID' })
  @ApiResponse({ status: 200, description: 'Product deleted successfully' })
  remove(@Param('id') id: string, @CurrentUser() user: any) {
    return this.productsService.remove(id, user.id);
  }
}
```

### 5. Module (`products.module.ts`)

```typescript
import { Module } from '@nestjs/common';
import { ProductsService } from './products.service';
import { ProductsController } from './products.controller';
import { PrismaService } from '@/database/prisma.service';

@Module({
  controllers: [ProductsController],
  providers: [ProductsService, PrismaService],
  exports: [ProductsService],
})
export class ProductsModule {}
```

### 6. Đăng ký trong AppModule (`app.module.ts`)

```typescript
import { ProductsModule } from './modules/products/products.module';

@Module({
  imports: [
    // ... existing modules
    AuthModule,
    UsersModule,
    HealthModule,
    ProductsModule, // Thêm module mới
    // ... other modules
  ],
  // ...
})
export class AppModule {}
```

---

## ✅ Best Practices

### 1. **Database**

- Luôn sử dụng `select` để chỉ lấy các trường cần thiết
- Sử dụng transactions cho operations phức tạp
- Sử dụng indexes cho các trường thường query
- Implement soft deletes nếu cần
- Sử dụng `Promise.all()` cho parallel queries
- Sử dụng `mode: 'insensitive'` cho case-insensitive search

### 2. **Validation**

- Luôn validate input với DTOs và `class-validator`
- Sử dụng `@ApiProperty` cho Swagger documentation
- Validate ownership trước khi update/delete
- Sử dụng `@Type()` từ `class-transformer` cho query parameters

### 3. **Error Handling**

- Sử dụng NestJS built-in exceptions (`NotFoundException`, `ConflictException`, `ForbiddenException`, etc.)
- Provide meaningful error messages
- Log errors với Winston logger
- Return consistent error format (được handle bởi `AllExceptionsFilter`)

### 4. **Security**

- Luôn sử dụng guards cho protected routes (`JwtAuthGuard`, `RolesGuard`)
- Implement role-based access control với `@Roles()` decorator
- Validate ownership cho user resources
- Sanitize input data
- Sử dụng `@Public()` decorator cho public routes
- Không expose sensitive data (password, tokens) trong responses

### 5. **Code Organization**

- Một module = một feature
- Group related files trong cùng folder
- Sử dụng barrel exports nếu cần
- Follow NestJS naming conventions:
  - Files: `kebab-case` (ví dụ: `create-product.dto.ts`)
  - Classes: `PascalCase` (ví dụ: `CreateProductDto`)
  - Variables: `camelCase` (ví dụ: `createProductDto`)

### 6. **Testing**

- Viết unit tests cho services
- Viết E2E tests cho controllers
- Maintain test coverage > 80%
- Test cả success và error cases
- Sử dụng mocks cho external dependencies

### 7. **Documentation**

- Sử dụng Swagger decorators (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
- Provide examples trong `@ApiProperty`
- Document API responses với examples
- Keep README updated

### 8. **Performance**

- Sử dụng pagination cho list endpoints
- Implement caching nếu cần (sử dụng `@nestjs/cache-manager`)
- Optimize database queries (sử dụng `select`, indexes)
- Use `Promise.all()` cho parallel operations

### 9. **Pagination**

- Luôn sử dụng `getPaginationOptions()` và `paginate()` từ `@/common/utils/pagination.util`
- Return consistent pagination format với `PaginatedResponse`
- Set reasonable default limits (ví dụ: 10 items per page)
- Set maximum limits để tránh abuse (ví dụ: max 100)

### 10. **Authorization**

- Check ownership trong service layer
- Admin có thể access tất cả resources
- Regular users chỉ có thể access resources của chính họ
- Sử dụng `@CurrentUser()` decorator để lấy current user

---

## 📋 Checklist

Khi implement một feature mới, đảm bảo:

- [ ] ✅ Đã cập nhật Prisma schema (nếu cần)
- [ ] ✅ Đã chạy `prisma:generate` và `prisma:migrate`
- [ ] ✅ Đã tạo DTOs (Create, Update, Query) với validation
- [ ] ✅ Đã thêm `@ApiProperty` cho Swagger documentation
- [ ] ✅ Đã implement Service với business logic
- [ ] ✅ Đã implement Controller với API endpoints
- [ ] ✅ Đã thêm guards và decorators cho security
- [ ] ✅ Đã thêm Swagger documentation (`@ApiTags`, `@ApiOperation`, `@ApiResponse`)
- [ ] ✅ Đã tạo Module và đăng ký trong AppModule
- [ ] ✅ Đã viết unit tests cho service
- [ ] ✅ Đã viết E2E tests cho controller
- [ ] ✅ Đã test feature hoạt động đúng
- [ ] ✅ Code đã pass linting (`npm run lint`)
- [ ] ✅ Code đã pass type checking (`npm run type-check`)
- [ ] ✅ Code đã pass formatting check (`npm run format:check`)
- [ ] ✅ Đã handle errors properly với NestJS exceptions
- [ ] ✅ Đã implement pagination (nếu cần)
- [ ] ✅ Đã implement authorization checks
- [ ] ✅ Đã sử dụng `select` để không expose sensitive data
- [ ] ✅ Đã test với different user roles (USER, ADMIN, MODERATOR)

---

## 🔗 Tài Liệu Tham Khảo

- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [TypeScript Handbook](https://www.typescriptlang.org/docs/)
- [class-validator Documentation](https://github.com/typestack/class-validator)
- [Swagger/OpenAPI](https://swagger.io/specification/)
- [NestJS Testing](https://docs.nestjs.com/fundamentals/testing)

---

## 🚀 Quick Start Commands

```bash
# Generate Prisma Client sau khi update schema
npm run prisma:generate

# Run database migrations
npm run prisma:migrate

# Start development server
npm run start:dev

# Run linter
npm run lint

# Run type checking
npm run type-check

# Format code
npm run format

# Run tests
npm run test

# Run E2E tests
npm run test:e2e

# Run tests with coverage
npm run test:cov
```

---

**Lưu ý:** Workflow này có thể điều chỉnh tùy theo nhu cầu của project. Quan trọng là giữ consistency trong codebase và follow các best practices đã được thiết lập.

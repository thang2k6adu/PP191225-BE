# Quick Start Guide

Hướng dẫn nhanh để setup và chạy NestJS Boilerplate.

## 📋 Yêu Cầu Hệ Thống

- **Node.js**: 20.x trở lên
- **PostgreSQL**: 15.x trở lên (hoặc sử dụng Docker)
- **Redis**: 7.x trở lên (optional nhưng khuyến nghị, hoặc sử dụng Docker)
- **npm**: 9.x trở lên hoặc **yarn**
- **Docker & Docker Compose**: (khuyến nghị để chạy database services)

## 🚀 Cài Đặt Nhanh

### Bước 1: Clone Repository

```bash
git clone <repository-url>
cd nest-boilerplate
```

### Bước 2: Cài Đặt Dependencies

```bash
npm install
```

### Bước 3: Setup Environment Variables

```bash
cp env.example .env
```

Chỉnh sửa file `.env` với các thông tin của bạn (xem chi tiết ở phần dưới).

### Bước 4: Setup Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database (optional)
npm run prisma:seed
```

### Bước 5: Chạy Ứng Dụng

```bash
# Development mode
npm run start:dev
```

Ứng dụng sẽ chạy tại: `http://localhost:3000/api`
Swagger docs tại: `http://localhost:3000/api/docs`

## 💻 Chạy Local Development

Có 2 cách để chạy local development:

### Cách 1: Chạy Local Dev với Docker Compose (Khuyến Nghị)

Cách này sử dụng Docker Compose để chạy PostgreSQL và Redis, còn ứng dụng NestJS chạy trên máy local của bạn với hot reload.

#### Bước 1: Start Database Services với Docker Compose

```bash
# Start PostgreSQL và Redis
docker-compose up -d db redis

# Kiểm tra services đang chạy
docker-compose ps
```

#### Bước 2: Cấu Hình Environment Variables

Tạo file `.env` từ `env.example` và cấu hình như sau:

```env
# Application
NODE_ENV=development
PORT=3000
APP_NAME=nest-boilerplate

# Database - Kết nối đến PostgreSQL trong Docker
# Lưu ý: Sử dụng localhost vì app chạy trên máy local, không phải trong Docker network
DATABASE_URL=postgresql://postgres:postgres@localhost:5432/nest_boilerplate?schema=public

# JWT
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=2h
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
JWT_REFRESH_EXPIRES_IN=7d

# Redis - Kết nối đến Redis trong Docker
# Lưu ý: Sử dụng localhost vì app chạy trên máy local
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# Mail Configuration (optional)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=noreply@example.com

# Storage Configuration
STORAGE_PROVIDER=local
STORAGE_LOCAL_DEST=./uploads
```

**Lưu ý quan trọng về cấu hình:**

- **DATABASE_URL**: Sử dụng `localhost:5432` (không phải `db:5432`) vì ứng dụng chạy trên máy local, không phải trong Docker network
- **REDIS_HOST**: Sử dụng `localhost` (không phải `redis`) vì lý do tương tự
- Các port `5432` và `6379` được expose ra host machine trong `docker-compose.yml`, nên có thể kết nối từ localhost

#### Bước 3: Chạy Database Migrations

```bash
# Generate Prisma Client
npm run prisma:generate

# Run migrations
npm run prisma:migrate

# Seed database (optional)
npm run prisma:seed
```

#### Bước 4: Start Development Server

```bash
npm run start:dev
```

Ứng dụng sẽ chạy với hot reload, tự động restart khi có thay đổi code.

#### Bước 5: Stop Services (khi cần)

```bash
# Stop database services
docker-compose down

# Hoặc chỉ stop mà không xóa volumes
docker-compose stop
```

**Ưu điểm của cách này:**

- ✅ Hot reload nhanh (code chạy trực tiếp trên máy)
- ✅ Dễ debug với breakpoints
- ✅ Không cần cài đặt PostgreSQL/Redis trên máy
- ✅ Database data được persist trong Docker volumes
- ✅ Dễ dàng reset database bằng cách xóa volumes

### Cách 2: Chạy Tất Cả Local (Không Dùng Docker)

Nếu bạn đã cài đặt PostgreSQL và Redis trên máy local:

#### Bước 1: Cấu Hình Environment Variables

```env
# Application
NODE_ENV=development
PORT=3000
APP_NAME=nest-boilerplate

# Database - Kết nối đến PostgreSQL local
DATABASE_URL=postgresql://postgres:your_password@localhost:5432/nest_boilerplate?schema=public

# Redis - Kết nối đến Redis local
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=

# JWT và các config khác...
```

#### Bước 2: Đảm Bảo PostgreSQL và Redis Đang Chạy

```bash
# Kiểm tra PostgreSQL
pg_isready

# Kiểm tra Redis
redis-cli ping
```

#### Bước 3: Chạy Migrations và Start App

```bash
npm run prisma:generate
npm run prisma:migrate
npm run start:dev
```

## 🐳 Chạy Tất Cả Với Docker Compose

Nếu bạn muốn chạy toàn bộ ứng dụng (bao gồm cả app) trong Docker:

```bash
# Build và start tất cả services
docker-compose up -d

# Xem logs
docker-compose logs -f app

# Stop services
docker-compose down
```

**Lưu ý:** Khi chạy app trong Docker, bạn sẽ không có hot reload. Cần rebuild image mỗi khi có thay đổi code.

## 🔧 Các Lệnh Thường Dùng

### Development

```bash
# Start development server với hot reload
npm run start:dev

# Start với debug mode
npm run start:debug

# Build project
npm run build

# Start production mode
npm run start:prod
```

### Database

```bash
# Generate Prisma Client
npm run prisma:generate

# Tạo migration mới
npm run prisma:migrate

# Xem database với Prisma Studio
npm run prisma:studio

# Seed database
npm run prisma:seed
```

### Docker Compose

```bash
# Start chỉ database services (cho local dev)
docker-compose up -d db redis

# Start tất cả services
docker-compose up -d

# Xem logs
docker-compose logs -f

# Stop services
docker-compose down

# Stop và xóa volumes (⚠️ sẽ xóa database data)
docker-compose down -v

# Rebuild services
docker-compose up -d --build
```

### Code Quality

```bash
# Lint code
npm run lint

# Fix linting issues
npm run lint:check

# Format code
npm run format

# Check formatting
npm run format:check

# Type check
npm run type-check
```

### Testing

```bash
# Run unit tests
npm run test

# Run tests với watch mode
npm run test:watch

# Run E2E tests
npm run test:e2e

# Run tests với coverage
npm run test:cov
```

## 🧪 Test API

### 1. Register User

```bash
curl -X POST http://localhost:3000/api/auth/register \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123",
    "firstName": "Test",
    "lastName": "User"
  }'
```

### 2. Login

```bash
curl -X POST http://localhost:3000/api/auth/login \
  -H "Content-Type: application/json" \
  -d '{
    "email": "test@example.com",
    "password": "password123"
  }'
```

Lưu lại `accessToken` từ response.

### 3. Access Protected Route

```bash
curl -X GET http://localhost:3000/api/users/profile \
  -H "Authorization: Bearer YOUR_ACCESS_TOKEN"
```

## 📚 Swagger Documentation

Sau khi start ứng dụng, truy cập Swagger UI tại:

```
http://localhost:3000/api/docs
```

Tại đây bạn có thể:

- Xem tất cả API endpoints
- Test API trực tiếp
- Xem request/response schemas
- Authenticate với JWT token

## 🔍 Troubleshooting

### Lỗi: Cannot connect to database

**Nguyên nhân**: PostgreSQL chưa chạy hoặc DATABASE_URL sai

**Giải pháp**:

```bash
# Kiểm tra PostgreSQL đang chạy (nếu dùng Docker)
docker-compose ps

# Hoặc start PostgreSQL
docker-compose up -d db

# Kiểm tra DATABASE_URL trong .env
# Đảm bảo sử dụng localhost:5432 khi chạy app local
# Đảm bảo sử dụng db:5432 khi chạy app trong Docker
```

### Lỗi: Redis connection failed

**Nguyên nhân**: Redis chưa chạy

**Giải pháp**:

```bash
# Start Redis (nếu dùng Docker)
docker-compose up -d redis

# Kiểm tra REDIS_HOST trong .env
# Đảm bảo sử dụng localhost khi chạy app local
# Đảm bảo sử dụng redis khi chạy app trong Docker
```

### Lỗi: Port 3000 already in use

**Nguyên nhân**: Port 3000 đã được sử dụng

**Giải pháp**:

```bash
# Đổi port trong .env
PORT=3001

# Hoặc kill process đang dùng port 3000
lsof -ti:3000 | xargs kill -9
```

### Lỗi: Prisma Client not generated

**Nguyên nhân**: Chưa chạy `prisma generate`

**Giải pháp**:

```bash
npm run prisma:generate
```

### Lỗi: Migration failed

**Nguyên nhân**: Database schema không khớp

**Giải pháp**:

```bash
# Reset database (⚠️ sẽ xóa tất cả data)
npx prisma migrate reset

# Hoặc tạo migration mới
npm run prisma:migrate
```

### Lỗi: Cannot connect to database từ local app đến Docker

**Nguyên nhân**: Sử dụng sai hostname trong DATABASE_URL

**Giải pháp**:

- Khi chạy app **local** với Docker Compose cho database: Sử dụng `localhost:5432`
- Khi chạy app **trong Docker**: Sử dụng `db:5432` (tên service trong docker-compose.yml)

Tương tự với Redis:

- App **local**: `REDIS_HOST=localhost`
- App **trong Docker**: `REDIS_HOST=redis`

## 🎯 Next Steps

Sau khi setup thành công:

1. **Đọc Coding Guide**: Xem [CODING_GUIDE.md](./CODING_GUIDE.md) để biết cách phát triển feature mới
2. **Xem API Documentation**: Truy cập Swagger UI tại `/api/docs`
3. **Kiểm tra Git Workflows**: Xem `.github/workflows/ci.yml` để hiểu CI/CD pipeline
4. **Setup Git Hooks**: Git hooks đã được setup tự động với Husky

## 📖 Tài Liệu Tham Khảo

- [NestJS Documentation](https://docs.nestjs.com/)
- [Prisma Documentation](https://www.prisma.io/docs)
- [Docker Documentation](https://docs.docker.com/)
- [Swagger/OpenAPI](https://swagger.io/)

## 💡 Tips

- **Sử dụng Docker Compose cho database**: Khuyến nghị chạy database services với Docker và app trên máy local để có hot reload tốt nhất
- **Sử dụng Prisma Studio**: `npm run prisma:studio` để xem và edit database trực tiếp
- **Enable hot reload**: Development mode tự động reload khi có thay đổi code
- **Sử dụng Swagger UI**: Test API trực tiếp tại `/api/docs` thay vì Postman/curl
- **Check logs**: Xem logs trong `logs/` directory nếu có lỗi
- **Reset database**: Sử dụng `docker-compose down -v` để xóa volumes và reset database về trạng thái ban đầu

## 🆘 Cần Giúp Đỡ?

Nếu gặp vấn đề:

1. Kiểm tra logs trong `logs/error.log`
2. Xem [README.md](./README.md) để biết thêm chi tiết
3. Kiểm tra [CODING_GUIDE.md](./CODING_GUIDE.md) cho best practices
4. Đảm bảo cấu hình `.env` đúng với môi trường bạn đang chạy (local vs Docker)

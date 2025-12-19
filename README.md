# NestJS Boilerplate

A comprehensive NestJS boilerplate with authentication, database setup, and best practices.

> 📖 **Quick Start**: Xem [QUICKSTART.md](./QUICKSTART.md) để bắt đầu nhanh chóng  
> 📝 **Coding Guide**: Xem [CODING_GUIDE.md](./CODING_GUIDE.md) để biết workflow phát triển feature

## Features

### Core Features

- ✅ **Authentication & Authorization**: JWT with Access/Refresh tokens, Passport strategies, Role-based access control
- ✅ **Database**: Prisma ORM with PostgreSQL, soft deletes, audit trail, transactions
- ✅ **Configuration**: Environment-based configuration with validation
- ✅ **Validation**: Global validation pipes with class-validator
- ✅ **Error Handling**: Global exception filter with standardized error responses
- ✅ **Logging**: Winston logger with request/response logging
- ✅ **API Documentation**: Swagger/OpenAPI integration
- ✅ **Security**: Helmet, CORS, Rate limiting (global, per-user, per-endpoint)
- ✅ **Testing**: Jest configuration with E2E test setup
- ✅ **Docker**: Multi-stage Dockerfile and docker-compose setup

### Advanced Features

- ✅ **Caching**: Redis caching with @nestjs/cache-manager, decorators, cache strategies
- ✅ **Queue System**: Bull queues for background jobs (email, notifications)
- ✅ **Event System**: EventEmitter and CQRS pattern support
- ✅ **WebSocket**: Socket.IO with JWT authentication, room management
- ✅ **File Storage**: S3, Local, Cloudinary providers with image processing
- ✅ **Email System**: NodeMailer with Handlebars templates, queue-based sending
- ✅ **Notifications**: Multi-channel (Email, SMS, Push, WebSocket)
- ✅ **Search Engine**: Elasticsearch integration with full-text search
- ✅ **Monitoring**: Prometheus metrics, distributed tracing
- ✅ **Microservices**: RabbitMQ, Kafka, NATS support

### Development Tools

- ✅ **Git Workflows**: GitHub Actions CI/CD pipeline
- ✅ **Code Quality**: ESLint, Prettier, Husky, lint-staged
- ✅ **Commit Standards**: Commitlint với conventional commits
- ✅ **Type Safety**: TypeScript strict mode
- ✅ **Testing**: Jest với unit tests và E2E tests
- ✅ **Documentation**: Swagger/OpenAPI tự động

Xem [FEATURES.md](./FEATURES.md) để biết chi tiết về tất cả các tính năng.

## Project Structure

```
src/
├── common/              # Shared utilities
│   ├── decorators/      # Custom decorators (@Public, @Roles, @CurrentUser)
│   ├── filters/         # Exception filters
│   ├── guards/          # Auth guards, role guards
│   ├── interceptors/    # Logging, transform, timeout
│   ├── pipes/           # Validation pipes
│   ├── middleware/      # Custom middleware
│   └── utils/           # Utility functions
├── config/              # Configuration
│   ├── database.config.ts
│   ├── jwt.config.ts
│   └── app.config.ts
├── modules/             # Feature modules
│   ├── auth/           # Authentication module
│   ├── users/          # Users CRUD
│   └── health/         # Health check
├── database/            # Database related
│   └── prisma.service.ts
└── main.ts
```

## Getting Started

> 💡 **Nhanh nhất**: Xem [QUICKSTART.md](./QUICKSTART.md) để có hướng dẫn chi tiết từng bước

### Prerequisites

- **Node.js**: 20.x trở lên
- **PostgreSQL**: 15.x trở lên
- **Redis**: 7.x trở lên (optional nhưng khuyến nghị)
- **npm**: 9.x trở lên hoặc **yarn**
- **Docker** (optional, khuyến nghị cho development)

### Quick Setup

```bash
# 1. Clone repository
git clone <repository-url>
cd nest-boilerplate

# 2. Install dependencies
npm install

# 3. Setup environment
cp env.example .env
# Chỉnh sửa .env với thông tin của bạn

# 4. Start với Docker (khuyến nghị)
docker-compose up -d

# 5. Setup database
npm run prisma:generate
npm run prisma:migrate

# 6. Start application
npm run start:dev
```

**Hoặc sử dụng Docker Compose để tự động setup tất cả:**

```bash
docker-compose up -d
```

The API will be available at `http://localhost:3000/api`  
Swagger documentation at `http://localhost:3000/api/docs`

### Development Workflow

Sau khi setup, xem [CODING_GUIDE.md](./CODING_GUIDE.md) để biết:

- Workflow phát triển feature mới
- Cấu trúc code và best practices
- Cách viết tests
- Code organization patterns

## API Response Format

### Success Response

```json
{
  "error": false,
  "code": 0,
  "message": "Success",
  "data": { ... },
  "traceId": "VIHOLaKaWe"
}
```

### Error Response

```json
{
  "error": true,
  "code": 403,
  "message": "Invalid token!",
  "data": null,
  "traceId": "VIHOLaKaWe"
}
```

### Paginated Response

```json
{
  "error": false,
  "code": 0,
  "message": "Success",
  "data": {
    "items": [],
    "meta": {
      "itemCount": 0,
      "totalItems": 0,
      "itemsPerPage": 10,
      "totalPages": 1,
      "currentPage": 1
    }
  },
  "traceId": "VIHOLaKaWe"
}
```

### Auth Response

```json
{
  "accessToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "expiredAt": "2025-09-29T08:08:14.822Z"
}
```

## Available Scripts

### Development

- `npm run start:dev` - Start development server với hot reload
- `npm run start:debug` - Start với debug mode
- `npm run build` - Build for production
- `npm run start:prod` - Start production server

### Database

- `npm run prisma:generate` - Generate Prisma Client
- `npm run prisma:migrate` - Run database migrations
- `npm run prisma:seed` - Seed database
- `npm run prisma:studio` - Open Prisma Studio (GUI để xem/edit database)

### Code Quality

- `npm run lint` - Run ESLint và tự động fix
- `npm run lint:check` - Check linting errors (không fix)
- `npm run format` - Format code với Prettier
- `npm run format:check` - Check formatting (không format)
- `npm run type-check` - TypeScript type checking

### Testing

- `npm run test` - Run unit tests
- `npm run test:watch` - Run tests với watch mode
- `npm run test:cov` - Run tests với coverage report
- `npm run test:e2e` - Run E2E tests

## Docker

### Using Docker Compose (Khuyến Nghị)

```bash
# Start tất cả services (PostgreSQL, Redis, App)
docker-compose up -d

# Xem logs
docker-compose logs -f

# Stop services
docker-compose down

# Rebuild và start
docker-compose up -d --build
```

Docker Compose sẽ tự động:

- ✅ Tạo PostgreSQL database
- ✅ Tạo Redis instance
- ✅ Chạy migrations (nếu có)
- ✅ Start ứng dụng

**Services:**

- Application: `http://localhost:3000`
- PostgreSQL: `localhost:5432`
- Redis: `localhost:6379`

### Building Docker Image

```bash
# Build image
docker build -t nest-boilerplate .

# Run container
docker run -p 3000:3000 nest-boilerplate
```

## Authentication

### Register

```bash
POST /api/auth/register
{
  "email": "user@example.com",
  "password": "password123",
  "firstName": "John",
  "lastName": "Doe"
}
```

### Login

```bash
POST /api/auth/login
{
  "email": "user@example.com",
  "password": "password123"
}
```

### Refresh Token

```bash
POST /api/auth/refresh
{
  "refreshToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
}
```

### Protected Routes

Add `Authorization: Bearer <accessToken>` header to access protected routes.

## Roles

- `USER` - Default role
- `ADMIN` - Admin access
- `MODERATOR` - Moderator access

Use `@Roles('ADMIN')` decorator to restrict routes to specific roles.

## Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov

# Watch mode
npm run test:watch
```

## Git Workflows & Code Quality

### Git Hooks (Husky)

Dự án sử dụng Husky để tự động chạy:

- **pre-commit**: Lint và format code với lint-staged
- **commit-msg**: Kiểm tra commit message format với commitlint

### Commit Message Format

Sử dụng [Conventional Commits](https://www.conventionalcommits.org/):

```
feat: add user authentication
fix: resolve database connection issue
docs: update README
style: format code
refactor: restructure auth module
test: add unit tests for users service
chore: update dependencies
```

### CI/CD Pipeline

GitHub Actions tự động chạy khi push/PR vào `main` hoặc `develop`:

- ✅ Lint check
- ✅ Format check
- ✅ Type check
- ✅ Unit tests với coverage
- ✅ E2E tests
- ✅ Build check

Xem `.github/workflows/ci.yml` để biết chi tiết.

### Code Quality Tools

- **ESLint**: Code linting với TypeScript rules
- **Prettier**: Code formatting
- **Husky**: Git hooks
- **lint-staged**: Chỉ lint files đã thay đổi
- **commitlint**: Kiểm tra commit message format

## Documentation

- 📖 [QUICKSTART.md](./QUICKSTART.md) - Hướng dẫn setup và chạy dự án
- 📝 [CODING_GUIDE.md](./CODING_GUIDE.md) - Workflow phát triển feature và best practices
- 📚 [Swagger UI](http://localhost:3000/api/docs) - API documentation (khi app đang chạy)

## Project Structure

```
nest-boilerplate/
├── src/
│   ├── common/              # Shared utilities
│   │   ├── decorators/      # Custom decorators (@Public, @Roles, @CurrentUser)
│   │   ├── filters/         # Exception filters
│   │   ├── guards/          # Auth guards, role guards
│   │   ├── interceptors/   # Logging, transform, timeout
│   │   ├── pipes/           # Validation pipes
│   │   ├── middleware/      # Custom middleware
│   │   └── utils/           # Utility functions
│   ├── config/              # Configuration files
│   ├── modules/             # Feature modules
│   │   ├── auth/           # Authentication
│   │   ├── users/          # Users CRUD
│   │   ├── health/         # Health check
│   │   └── ...             # Other modules
│   ├── database/            # Database services
│   └── main.ts             # Application entry point
├── prisma/                  # Prisma schema và migrations
├── test/                    # E2E tests
├── .github/                 # GitHub workflows
│   └── workflows/
│       └── ci.yml          # CI/CD pipeline
├── .husky/                  # Git hooks
├── CODING_GUIDE.md         # Development workflow guide
├── QUICKSTART.md           # Quick start guide
└── README.md               # This file
```

## Contributing

1. Tạo branch mới từ `develop`
2. Follow [CODING_GUIDE.md](./CODING_GUIDE.md) khi phát triển feature
3. Đảm bảo code pass lint, format, và type check
4. Viết tests cho feature mới
5. Tạo Pull Request với mô tả rõ ràng

## License

MIT

# 🐳 Hướng Dẫn Chạy Docker

Tài liệu này hướng dẫn chi tiết cách deploy ứng dụng NestJS với Docker theo 2 phương pháp:

1. **Chỉ dùng Dockerfile** (standalone container với database/Redis remote)
2. **Dùng Docker Compose** (full stack: app + database + Redis local)

---

## 📋 Mục Lục

- [Phần 1: Chạy Dockerfile Standalone](#phần-1-chạy-dockerfile-standalone)
- [Phần 2: Chạy Docker Compose](#phần-2-chạy-docker-compose)
- [Troubleshooting](#troubleshooting)

---

## Phần 1: Chạy Dockerfile Standalone

Phương pháp này phù hợp khi bạn:

- Đã có database và Redis remote (Neon, Supabase, Upstash, AWS, etc.)
- Chỉ cần deploy riêng ứng dụng NestJS
- Deploy lên VPS/Cloud với database managed service

### Bước 1: Chuẩn bị file `.env`

Sao chép file mẫu và cấu hình:

```bash
cp env.example .env
```

Cấu hình `.env` cho production với **remote services**:

```bash
# Application
NODE_ENV=production
PORT=3000
APP_NAME=nest-boilerplate

# Database Remote (ví dụ: Neon, Supabase)
DATABASE_URL=postgresql://user:password@your-db-host.com:5432/database_name?sslmode=require

# JWT
JWT_SECRET=your-super-secret-jwt-key-CHANGE-THIS
JWT_EXPIRES_IN=2h
JWT_REFRESH_SECRET=your-super-secret-refresh-key-CHANGE-THIS
JWT_REFRESH_EXPIRES_IN=7d

# Redis Remote (ví dụ: Upstash, Redis Cloud)
REDIS_HOST=your-redis-host.upstash.io
REDIS_PORT=6379
REDIS_PASSWORD=your-redis-password
REDIS_TLS=true  # Bắt buộc nếu dùng Upstash hoặc Redis Cloud

# Mail Configuration (Gmail App Password)
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-16-char-app-password
MAIL_FROM=noreply@yourdomain.com

# Storage
STORAGE_PROVIDER=local
STORAGE_LOCAL_DEST=./uploads

# Firebase (nếu dùng Firebase Auth)
FIREBASE_PROJECT_ID=your-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_KEY\n-----END PRIVATE KEY-----\n
```

**⚠️ LƯU Ý QUAN TRỌNG:**

- **KHÔNG dùng dấu ngoặc kép** (`"`) cho `DATABASE_URL` - Prisma sẽ báo lỗi
- **Upstash Redis YÊU CẦU** `REDIS_TLS=true`
- Thay đổi tất cả các `JWT_SECRET` thành giá trị ngẫu nhiên mạnh

### Bước 2: Build Docker Image

```bash
# Build image với tag
docker build -t nest-app:latest .

# Hoặc build với custom tag
docker build -t nest-app:v1.0.0 .
```

**Kiểm tra image đã build:**

```bash
docker images | grep nest-app
```

### Bước 3: Run Container

#### Cách 1: Run với file .env (Khuyến nghị)

```bash
docker run -d \
  --name nest-app \
  -p 3001:3000 \
  --env-file .env \
  --restart unless-stopped \
  nest-app:latest
```

#### Cách 2: Run với environment variables trực tiếp

```bash
docker run -d \
  --name nest-app \
  -p 3001:3000 \
  -e NODE_ENV=production \
  -e DATABASE_URL=postgresql://user:pass@host:5432/db \
  -e REDIS_HOST=your-redis.upstash.io \
  -e REDIS_PORT=6379 \
  -e REDIS_PASSWORD=your-password \
  -e REDIS_TLS=true \
  -e JWT_SECRET=your-secret \
  -e JWT_REFRESH_SECRET=your-refresh-secret \
  --restart unless-stopped \
  nest-app:latest
```

### Bước 4: Kiểm tra và quản lý container

#### Xem logs

```bash
# Xem tất cả logs
docker logs nest-app

# Follow logs real-time
docker logs -f nest-app

# Xem 100 dòng logs cuối
docker logs --tail 100 nest-app
```

#### Kiểm tra trạng thái

```bash
# Xem container đang chạy
docker ps

# Xem tất cả containers (kể cả đã dừng)
docker ps -a

# Xem resource usage
docker stats nest-app
```

#### Kiểm tra health

```bash
# Test health endpoint
curl http://localhost:3001/api/health

# Kết quả mong đợi:
# {
#   "status": "ok",
#   "database": "connected",
#   "timestamp": "..."
# }
```

#### Quản lý container

```bash
# Dừng container
docker stop nest-app

# Khởi động lại
docker start nest-app

# Restart
docker restart nest-app

# Xóa container
docker rm nest-app

# Xóa container đang chạy (force)
docker rm -f nest-app
```

#### Exec vào container (troubleshoot)

```bash
# Truy cập shell trong container
docker exec -it nest-app sh

# Chạy một lệnh cụ thể
docker exec nest-app ls -la /app

# Kiểm tra biến môi trường
docker exec nest-app env | grep REDIS
```

### Bước 5: Update ứng dụng

```bash
# 1. Dừng và xóa container cũ
docker stop nest-app
docker rm nest-app

# 2. Pull code mới và rebuild
git pull
docker build -t nest-app:latest .

# 3. Run container mới
docker run -d \
  --name nest-app \
  -p 3001:3000 \
  --env-file .env \
  --restart unless-stopped \
  nest-app:latest
```

### Bước 6: Dọn dẹp

```bash
# Xóa images cũ không dùng
docker image prune -a

# Xóa tất cả (containers, images, volumes, networks)
docker system prune -a --volumes
```

---

## Phần 2: Chạy Docker Compose

Phương pháp này chạy **full stack** bao gồm:

- ✅ NestJS Application
- ✅ PostgreSQL Database (local)
- ✅ Redis (local)

### 2.1: Docker Compose - Development Mode

#### File cấu hình: `docker-compose.dev.yml`

Tạo file `docker-compose.dev.yml`:

```yaml
version: '3.8'

services:
  app-dev:
    build:
      context: .
      dockerfile: Dockerfile
      target: builder # Use builder stage for development
    container_name: nest-app-dev
    command: npm run start:dev # Hot reload
    ports:
      - '3000:3000'
    env_file:
      - .env
    environment:
      - NODE_ENV=development
      - DATABASE_URL=postgresql://postgres:postgres@db-dev:5432/nest_boilerplate?schema=public
      - REDIS_HOST=redis-dev
      - REDIS_PORT=6379
      - REDIS_TLS=false
    volumes:
      - .:/app
      - /app/node_modules
      - ./uploads:/app/uploads
    depends_on:
      db-dev:
        condition: service_healthy
      redis-dev:
        condition: service_healthy
    networks:
      - nest-network-dev
    restart: unless-stopped

  db-dev:
    image: postgres:16-alpine
    container_name: nest-db-dev
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=nest_boilerplate
    ports:
      - '5432:5432'
    volumes:
      - postgres_data_dev:/var/lib/postgresql/data
    networks:
      - nest-network-dev
    restart: unless-stopped
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5

  redis-dev:
    image: redis:7-alpine
    container_name: nest-redis-dev
    ports:
      - '6379:6379'
    volumes:
      - redis_data_dev:/data
    networks:
      - nest-network-dev
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data_dev:
  redis_data_dev:

networks:
  nest-network-dev:
    driver: bridge
```

#### Chạy Development Mode

```bash
# Start tất cả services
docker-compose -f docker-compose.dev.yml up -d

# Xem logs
docker-compose -f docker-compose.dev.yml logs -f

# Chỉ xem logs của app
docker-compose -f docker-compose.dev.yml logs -f app-dev

# Stop tất cả
docker-compose -f docker-compose.dev.yml down

# Stop và xóa volumes (xóa data)
docker-compose -f docker-compose.dev.yml down -v
```

#### Run Prisma migrations trong dev

```bash
# Generate Prisma Client
docker-compose -f docker-compose.dev.yml exec app-dev npx prisma generate

# Run migrations
docker-compose -f docker-compose.dev.yml exec app-dev npx prisma migrate dev

# Seed database
docker-compose -f docker-compose.dev.yml exec app-dev npx prisma db seed

# Prisma Studio
docker-compose -f docker-compose.dev.yml exec app-dev npx prisma studio
```

---

### 2.2: Docker Compose - Production Mode

#### File hiện tại: `docker-compose.yml`

File này đã có sẵn trong project:

```yaml
version: '3.8'

services:
  app:
    build:
      context: .
      dockerfile: Dockerfile
      target: production
    container_name: nest-boilerplate-app
    ports:
      - '3001:3000'
    env_file:
      - .env
    environment:
      - NODE_ENV=production
      - DATABASE_URL=postgresql://postgres:postgres@db:5432/nest_boilerplate?schema=public
      - REDIS_HOST=redis
      - REDIS_PORT=6379
      - REDIS_TLS=false
    depends_on:
      - db
      - redis
    networks:
      - nest-network
    restart: unless-stopped

  db:
    image: postgres:16-alpine
    container_name: nest-boilerplate-db
    environment:
      - POSTGRES_USER=postgres
      - POSTGRES_PASSWORD=postgres
      - POSTGRES_DB=nest_boilerplate
    ports:
      - '5432:5432'
    volumes:
      - postgres_data:/var/lib/postgresql/data
    networks:
      - nest-network
    restart: unless-stopped
    healthcheck:
      test: ['CMD-SHELL', 'pg_isready -U postgres']
      interval: 10s
      timeout: 5s
      retries: 5

  redis:
    image: redis:7-alpine
    container_name: nest-boilerplate-redis
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data
    networks:
      - nest-network
    restart: unless-stopped
    healthcheck:
      test: ['CMD', 'redis-cli', 'ping']
      interval: 10s
      timeout: 5s
      retries: 5

volumes:
  postgres_data:
  redis_data:

networks:
  nest-network:
    driver: bridge
```

#### Chuẩn bị file .env cho Production Compose

Cấu hình `.env` cho **local database và Redis**:

```bash
NODE_ENV=production
PORT=3000
APP_NAME=nest-boilerplate

# Database sẽ được override bởi docker-compose environment
DATABASE_URL=postgresql://postgres:postgres@db:5432/nest_boilerplate?schema=public

# Redis sẽ được override bởi docker-compose environment
REDIS_HOST=redis
REDIS_PORT=6379
REDIS_PASSWORD=
REDIS_TLS=false

# JWT - ĐỔI THÀNH GIÁ TRỊ MẠNH
JWT_SECRET=your-super-secret-jwt-key-change-this-in-production
JWT_EXPIRES_IN=2h
JWT_REFRESH_SECRET=your-super-secret-refresh-key-change-this-in-production
JWT_REFRESH_EXPIRES_IN=7d

# Mail Configuration
MAIL_HOST=smtp.gmail.com
MAIL_PORT=587
MAIL_SECURE=false
MAIL_USER=your-email@gmail.com
MAIL_PASSWORD=your-app-password
MAIL_FROM=noreply@example.com

# Storage
STORAGE_PROVIDER=local
STORAGE_LOCAL_DEST=./uploads

# Firebase
FIREBASE_PROJECT_ID=your-firebase-project-id
FIREBASE_CLIENT_EMAIL=firebase-adminsdk-xxxxx@your-project.iam.gserviceaccount.com
FIREBASE_PRIVATE_KEY=-----BEGIN PRIVATE KEY-----\nYOUR_PRIVATE_KEY\n-----END PRIVATE KEY-----\n
```

#### Chạy Production Mode

```bash
# Đóng container đang chạy
docker stop $(docker ps -q) && docker rm $(docker ps -aq)

# Build và start tất cả services
docker-compose up -d

# Build lại trước khi start (khi có code changes)
docker-compose up -d --build

# Xem logs
docker-compose logs -f

# Chỉ xem logs của app
docker-compose logs -f app

# Xem trạng thái
docker-compose ps

# Stop tất cả
docker-compose down

# Stop và xóa volumes (XÓA DATA!)
docker-compose down -v
```

#### Run Prisma migrations trong production

```bash
# Generate Prisma Client
docker-compose exec app npx prisma generate

# Run migrations
docker-compose exec app npx prisma migrate deploy

# Seed database (nếu cần)
docker-compose exec app npx prisma db seed
```

#### Quản lý services riêng lẻ

```bash
# Restart chỉ app service
docker-compose restart app

# Stop chỉ Redis
docker-compose stop redis

# Xem logs của database
docker-compose logs -f db

# Rebuild chỉ app
docker-compose up -d --build app
```

---

## 🔧 Docker Compose Commands Cheat Sheet

### Quản lý cơ bản

```bash
# Start services
docker-compose up -d

# Stop services
docker-compose down

# Restart services
docker-compose restart

# View status
docker-compose ps

# View logs
docker-compose logs -f
docker-compose logs -f app        # Specific service
docker-compose logs --tail=100 app # Last 100 lines
```

### Build & Update

```bash
# Build images
docker-compose build

# Build without cache
docker-compose build --no-cache

# Build specific service
docker-compose build app

# Rebuild and restart
docker-compose up -d --build
```

### Exec commands

```bash
# Execute command in service
docker-compose exec app sh
docker-compose exec app npm run test
docker-compose exec db psql -U postgres

# Run one-off command
docker-compose run --rm app npx prisma migrate dev
```

### Cleanup

```bash
# Stop and remove containers
docker-compose down

# Remove containers and volumes
docker-compose down -v

# Remove containers, volumes, and images
docker-compose down -v --rmi all
```

---

## 🛠 Troubleshooting

### Lỗi 1: Redis connection failed

**Triệu chứng:**

```
SocketClosedUnexpectedlyError: Socket closed unexpectedly
```

**Nguyên nhân và giải pháp:**

1. **Nếu dùng Upstash/Redis Cloud:**

   ```bash
   # Kiểm tra .env có REDIS_TLS=true
   REDIS_TLS=true
   ```

2. **Nếu dùng Redis local:**

   ```bash
   # Kiểm tra Redis đang chạy
   docker-compose ps redis

   # Kiểm tra .env
   REDIS_TLS=false
   ```

3. **Test Redis connection:**
   ```bash
   # Từ container
   docker exec nest-app redis-cli -h $REDIS_HOST -p $REDIS_PORT ping
   ```

### Lỗi 2: Database connection failed

**Triệu chứng:**

```
PrismaClientInitializationError: the URL must start with protocol postgresql://
```

**Giải pháp:**

- **XÓA dấu ngoặc kép** trong DATABASE_URL
- ❌ Sai: `DATABASE_URL="postgresql://..."`
- ✅ Đúng: `DATABASE_URL=postgresql://...`

### Lỗi 3: Container tự động thoát

```bash
# Xem logs để biết nguyên nhân
docker logs nest-app

# Xem exit code
docker ps -a | grep nest-app
```

**Nguyên nhân thường gặp:**

- Thiếu biến môi trường bắt buộc (JWT_SECRET, DATABASE_URL)
- Database không kết nối được
- Port đã được sử dụng

### Lỗi 4: Port already in use

```bash
# Tìm process đang dùng port
sudo lsof -i :3000
sudo lsof -i :5432
sudo lsof -i :6379

# Kill process
kill -9 <PID>

# Hoặc đổi port trong docker-compose.yml
ports:
  - "3002:3000"  # Map host port 3002 to container port 3000
```

### Lỗi 5: Cannot connect to Docker daemon

```bash
# Start Docker daemon
sudo systemctl start docker

# Enable Docker on boot
sudo systemctl enable docker

# Add user to docker group (no need sudo)
sudo usermod -aG docker $USER
# Logout and login again
```

### Lỗi 6: Permission denied for uploads/logs

```bash
# Fix permissions
docker exec nest-app chown -R nestjs:nodejs /app/uploads /app/logs

# Hoặc rebuild image
docker-compose down
docker-compose build --no-cache
docker-compose up -d
```

### Debug tips

```bash
# 1. Kiểm tra environment variables trong container
docker exec nest-app env

# 2. Kiểm tra Prisma có generate không
docker exec nest-app ls -la node_modules/.prisma/client

# 3. Test database connection
docker exec nest-app npx prisma db pull

# 4. Kiểm tra network
docker network inspect nest-network

# 5. Xem resource usage
docker stats

# 6. Xem container details
docker inspect nest-app
```

---

## 📦 Production Deployment Checklist

Trước khi deploy production, kiểm tra:

- [ ] Đổi tất cả JWT secrets thành giá trị ngẫu nhiên mạnh
- [ ] Cấu hình CORS_ORIGIN cho domain production
- [ ] Đổi POSTGRES_PASSWORD thành password mạnh
- [ ] Cấu hình Redis password (nếu expose ra internet)
- [ ] Enable HTTPS/SSL
- [ ] Cấu hình backup cho database
- [ ] Setup monitoring và logging
- [ ] Test health endpoint
- [ ] Run security audit: `npm audit`
- [ ] Test với production data

---

## 📚 Tài Liệu Tham Khảo

- [Docker Documentation](https://docs.docker.com/)
- [Docker Compose Documentation](https://docs.docker.com/compose/)
- [NestJS Docker Guide](https://docs.nestjs.com/recipes/docker)
- [Prisma with Docker](https://www.prisma.io/docs/guides/deployment/deployment-guides/deploying-to-aws-ecs#deploy-with-docker)

---

**Tác giả:** NestJS Boilerplate Team  
**Cập nhật:** 2025-12-20

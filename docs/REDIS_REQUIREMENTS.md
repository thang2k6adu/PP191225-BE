# Redis Requirements

## Tổng quan

Backend sử dụng Redis cho 2 tính năng:

1. **Matchmaking Queue** - Hàng đợi ghép đôi người dùng
2. **Socket.IO Adapter** - Scale ngang cho nhiều server instances

## Development Mode (Không có Redis)

Server vẫn chạy bình thường nếu Redis không available, nhưng:

### ✅ Các tính năng hoạt động:

- Authentication
- User management
- **Public rooms** (database-based)
- Room management
- LiveKit integration
- Tasks & Tracking
- All other APIs

### ❌ Các tính năng không hoạt động:

- **Matchmaking queue** - API sẽ trả về lỗi 500
- **Socket.IO horizontal scaling** - Chỉ chạy được 1 server instance

### Khởi động không có Redis:

```bash
npm run start:dev
```

Bạn sẽ thấy warnings:

```
⚠️  Redis unavailable - matchmaking queue disabled
⚠️  Socket.IO running without Redis adapter (single instance only)
```

## Production Mode (Cần Redis)

### Cài đặt Redis

**Docker:**

```bash
docker run -d \
  --name redis \
  -p 6379:6379 \
  redis:7-alpine
```

**Docker Compose:**

```yaml
services:
  redis:
    image: redis:7-alpine
    ports:
      - '6379:6379'
    volumes:
      - redis_data:/data

volumes:
  redis_data:
```

**Linux (Fedora/RHEL):**

```bash
sudo dnf install redis
sudo systemctl start redis
sudo systemctl enable redis
```

### Cấu hình

File `.env`:

```env
REDIS_HOST=localhost
REDIS_PORT=6379
REDIS_PASSWORD=
```

### Verify Redis hoạt động:

```bash
# Test connection
redis-cli ping
# Output: PONG

# Check logs khi start server
npm run start:dev
# Output: ✅ Redis connected for matchmaking
#         ✅ Socket.IO Redis adapter connected
```

## Matchmaking Flow

### Khi có Redis:

1. User gọi `POST /api/matchmaking/join` với `topic` (math/coding/english/pomodoro)
2. Backend thêm user vào Redis queue: `matchmaking:queue:{topic}`
3. Nếu đủ 2 người trong queue → tự động ghép đôi
4. Tạo MATCH room trong database
5. Emit event `match_found` cho cả 2 users qua Socket.IO
6. Frontend nhận room info và join LiveKit

### Khi không có Redis:

1. User gọi `POST /api/matchmaking/join`
2. Backend trả về lỗi: `{statusCode: 500, message: "Redis not available"}`
3. Frontend nhận suggest: danh sách public rooms
4. User có thể join public room thay thế

## Socket.IO Scaling

### Single Instance (Không có Redis):

- Tất cả WebSocket connections đến 1 server
- Events chỉ broadcast trong 1 instance
- Max ~10k concurrent connections

### Multi Instance (Có Redis):

- Redis pub/sub làm message bus
- Events broadcast cross-instance
- Load balancer phân tán connections
- Scale horizontal không giới hạn

## Troubleshooting

### Redis connection refused:

```
⚠️  Redis unavailable - matchmaking queue disabled
```

**Fix:**

1. Check Redis đang chạy: `systemctl status redis` hoặc `docker ps | grep redis`
2. Check port: `netstat -tlnp | grep 6379`
3. Check config trong `.env`

### Redis auth failed:

```
ERROR [MatchmakingRedisService] Redis connection error: WRONGPASS
```

**Fix:** Set đúng `REDIS_PASSWORD` trong `.env`

### Matchmaking API trả 500:

```json
{
  "statusCode": 500,
  "message": "Internal server error",
  "suggestPublicRooms": [...]
}
```

**Nguyên nhân:** Redis không available  
**Giải pháp tạm:** Sử dụng public rooms thay cho matchmaking

## Best Practices

### Development:

- Không cần Redis cho development thông thường
- Chỉ start Redis khi test matchmaking flow
- Sử dụng Docker để tránh install Redis local

### Staging/Production:

- **Bắt buộc** phải có Redis
- Sử dụng Redis Sentinel hoặc Redis Cluster cho HA
- Monitor Redis memory usage
- Set TTL cho all keys (default 600s)

### Monitoring:

```bash
# Check queue length
redis-cli LLEN matchmaking:queue:math

# Check user state
redis-cli GET matchmaking:user:user-123

# View all matchmaking keys
redis-cli KEYS "matchmaking:*"
```

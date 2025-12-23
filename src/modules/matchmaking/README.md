# Matchmaking Module

Backend matchmaking (ghép trận) MVP cho ứng dụng game 2 người chơi.

## 📋 Tổng Quan

Module matchmaking cung cấp tính năng ghép trận tự động cho 2 người chơi vào một phòng chơi. Hệ thống sử dụng in-memory store (không cần database) và WebSocket cho real-time communication.

### Tính Năng

- ✅ Ghép trận tự động 2 người
- ✅ State machine: IDLE → WAITING → IN_ROOM
- ✅ WebSocket real-time events
- ✅ Concurrency control (mutex lock)
- ✅ Auto cleanup khi disconnect
- ✅ JWT authentication
- ✅ REST API + WebSocket

## 🏗️ Kiến Trúc

### State Machine

```
IDLE (Người dùng rảnh)
  ↓ POST /matchmaking/join
WAITING (Đang chờ đối thủ)
  ↓ Tìm được đối thủ
IN_ROOM (Đang trong phòng)
  ↓ Disconnect hoặc leave room
IDLE
```

### Data Structures (In-Memory)

```typescript
// Queue người chờ
waitingQueue: UserInfo[] = []

// Map phòng chơi
roomStore: Map<roomId, RoomData>

// Trạng thái user
userState: Map<userId, UserState>

// Map userId → socketId
onlineUsers: Map<userId, socketId>

// Map userId → roomId
userRoomMap: Map<userId, roomId>
```

## 🚀 Quick Start

### 1. Cài Đặt

Module đã được tích hợp sẵn trong project. Chỉ cần start server:

```bash
npm run start:dev
```

### 2. Connect WebSocket

Client cần connect WebSocket trước khi tham gia matchmaking:

```typescript
import { io } from 'socket.io-client';

const socket = io('http://localhost:3000/matchmaking', {
  auth: {
    token: 'your-jwt-token', // JWT token từ login
  },
});

// Lắng nghe sự kiện kết nối thành công
socket.on('connected', (data) => {
  console.log('Connected:', data);
});

// Lắng nghe lỗi
socket.on('error', (error) => {
  console.error('Error:', error);
});
```

### 3. Join Matchmaking (REST API)

Sau khi connect WebSocket, gọi API để join matchmaking:

```bash
curl -X POST http://localhost:3000/matchmaking/join \
  -H "Authorization: Bearer YOUR_JWT_TOKEN"
```

**Response khi chờ đối thủ:**

```json
{
  "error": false,
  "code": 0,
  "message": "Success",
  "data": {
    "status": "WAITING",
    "message": "Waiting for opponent..."
  }
}
```

**Response khi match ngay:**

```json
{
  "error": false,
  "code": 0,
  "message": "Success",
  "data": {
    "status": "MATCHED",
    "message": "Match found!",
    "matchData": {
      "roomId": "uuid-room-123",
      "opponentId": "opponent-user-id",
      "opponentName": "John Doe"
    }
  }
}
```

### 4. WebSocket Events

#### Sự kiện từ Server → Client

##### `match_found` - Tìm được đối thủ

```typescript
socket.on('match_found', (data) => {
  console.log('Match found!', data);
  /*
  {
    roomId: "uuid-room-123",
    opponentId: "opponent-user-id",
    opponentName: "John Doe",
    message: "Match found!"
  }
  */

  // Join room để nhận events từ phòng
  socket.emit('join_room', { roomId: data.roomId });
});
```

##### `opponent_disconnected` - Đối thủ disconnect

```typescript
socket.on('opponent_disconnected', (data) => {
  console.log('Opponent disconnected', data);
  /*
  {
    message: "Your opponent has disconnected",
    roomId: "uuid-room-123"
  }
  */
});
```

##### `opponent_left` - Đối thủ rời phòng

```typescript
socket.on('opponent_left', (data) => {
  console.log('Opponent left', data);
  /*
  {
    message: "Your opponent has left the room",
    roomId: "uuid-room-123"
  }
  */
});
```

##### `room_joined` - Join room thành công

```typescript
socket.on('room_joined', (data) => {
  console.log('Room joined', data);
  /*
  {
    roomId: "uuid-room-123",
    message: "Successfully joined room"
  }
  */
});
```

##### `room_left` - Leave room thành công

```typescript
socket.on('room_left', (data) => {
  console.log('Left room', data);
  /*
  {
    message: "Successfully left room"
  }
  */
});
```

#### Sự kiện từ Client → Server

##### `join_room` - Join vào phòng sau khi match

```typescript
socket.emit('join_room', { roomId: 'uuid-room-123' });
```

##### `leave_room` - Rời phòng

```typescript
socket.emit('leave_room');
```

## 📡 REST API Endpoints

### 1. POST `/matchmaking/join`

Join matchmaking queue

**Headers:**

```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**

- `200 OK`: Đã join (WAITING hoặc MATCHED)
- `401 Unauthorized`: Token invalid
- `409 Conflict`: Đã trong queue hoặc room

### 2. POST `/matchmaking/cancel`

Hủy matchmaking (remove khỏi queue)

**Headers:**

```
Authorization: Bearer YOUR_JWT_TOKEN
```

**Response:**

- `200 OK`: Đã hủy thành công
- `409 Conflict`: Không trong queue

### 3. GET `/matchmaking/status`

Lấy trạng thái hiện tại

**Response:**

```json
{
  "error": false,
  "code": 0,
  "message": "Success",
  "data": {
    "state": "IN_ROOM",
    "room": {
      "roomId": "uuid-room-123",
      "players": ["user1", "user2"],
      "createdAt": "2025-12-23T10:00:00Z"
    }
  }
}
```

### 4. GET `/matchmaking/stats`

Lấy thống kê hệ thống (cho debug/monitoring)

**Response:**

```json
{
  "error": false,
  "code": 0,
  "message": "Success",
  "data": {
    "waitingQueueSize": 5,
    "activeRooms": 10,
    "onlineUsers": 25,
    "stateDistribution": {
      "idle": 10,
      "waiting": 5,
      "inRoom": 20
    }
  }
}
```

## 🔄 User Flow

### Flow Thành Công

```
1. User 1: Connect WebSocket (/matchmaking namespace)
   └─> Server: Verify JWT → registerUser()

2. User 1: POST /matchmaking/join
   └─> Server: Add to waitingQueue
   └─> Response: { status: "WAITING" }

3. User 2: Connect WebSocket
   └─> Server: Verify JWT → registerUser()

4. User 2: POST /matchmaking/join
   └─> Server: Match với User 1 → Create room
   └─> Response: { status: "MATCHED", matchData: {...} }
   └─> WebSocket Event: 'match_found' → Cả 2 users

5. Both Users: socket.emit('join_room', { roomId })
   └─> Server: Add users to socket.io room
   └─> WebSocket Event: 'room_joined'

6. Game Start! 🎮
```

### Flow Cancel

```
1. User: POST /matchmaking/join
   └─> State: WAITING

2. User: POST /matchmaking/cancel
   └─> Remove from queue
   └─> State: IDLE
```

### Flow Disconnect

```
1. User đang WAITING → Disconnect
   └─> Remove from queue
   └─> State: IDLE

2. User đang IN_ROOM → Disconnect
   └─> Destroy room
   └─> WebSocket Event: 'opponent_disconnected' → Đối thủ
   └─> Reset cả 2 users về IDLE
```

## 🔒 Security

### JWT Authentication

- WebSocket: Token trong `auth.token` hoặc `authorization` header
- REST API: Token trong `Authorization: Bearer` header

### Authorization

- User chỉ có thể join/cancel matchmaking cho chính mình
- User chỉ có thể join room mà họ được match vào

## 🧪 Testing

### Unit Tests

```bash
npm run test -- matchmaking.service.spec.ts
```

Các test cases:

- ✅ Register/unregister users
- ✅ Join matchmaking (waiting)
- ✅ Match 2 users
- ✅ Cancel matchmaking
- ✅ Handle disconnect
- ✅ Leave room
- ✅ Concurrency (multiple users join simultaneously)
- ✅ Error cases (already in queue, already in room, etc.)

### Manual Testing với Postman/Thunder Client

1. **Login để lấy token:**

```bash
POST /api/auth/login
Body: { "email": "user@example.com", "password": "password" }
```

2. **Connect WebSocket** (dùng tool như socket.io-client)

3. **Join matchmaking:**

```bash
POST /matchmaking/join
Header: Authorization: Bearer TOKEN
```

4. **Check status:**

```bash
GET /matchmaking/status
Header: Authorization: Bearer TOKEN
```

## 🐛 Debugging

### Logs

Service sử dụng NestJS Logger, check logs:

```bash
# Trong console khi run dev
[MatchmakingService] User user-123 added to waiting queue
[MatchmakingService] Match found! Room room-456 created for users user-123 and user-789
[MatchmakingGateway] Client abc123 connected as user user-123
[MatchmakingGateway] Match found event sent to users user-123 and user-789
```

### Check Statistics

```bash
GET /matchmaking/stats
```

Để xem:

- Số người đang chờ trong queue
- Số phòng đang active
- Số user online
- Phân bố state (IDLE/WAITING/IN_ROOM)

## 🔧 Configuration

Module không cần configuration đặc biệt, sử dụng config có sẵn:

- `jwt.secret`: Từ `.env` (JWT_SECRET)
- WebSocket CORS: Allow all origins (có thể điều chỉnh trong [matchmaking.gateway.ts](matchmaking.gateway.ts#L17-L19))

## 🚨 Error Handling

### Common Errors

#### `409 Conflict: User already in a room`

→ User đang ở trong phòng, không thể join matchmaking

#### `409 Conflict: User already in matchmaking queue`

→ User đã trong queue, không cần join lại

#### `409 Conflict: Please connect to WebSocket before joining matchmaking`

→ Phải connect WebSocket trước khi join

#### `401 Unauthorized`

→ JWT token invalid hoặc expired

## 🔄 Concurrency Control

Service sử dụng **simple mutex lock** để tránh race conditions:

```typescript
// Trong joinMatchmaking()
await this.acquireLock(); // Wait nếu đang xử lý
try {
  // Xử lý matchmaking logic
} finally {
  this.releaseLock();
}
```

Đảm bảo:

- Không match 1 user với nhiều người cùng lúc
- Không tạo duplicate rooms
- Queue operations thread-safe

## 📊 Architecture Decisions

### Tại sao In-Memory Store?

- **MVP requirements**: Không cần persist data
- **Performance**: Cực nhanh, không có database overhead
- **Simplicity**: Dễ implement và test
- **Trade-off**: Data mất khi restart server (chấp nhận được cho MVP)

### Tại sao Separate WebSocket Namespace?

- **Isolation**: Matchmaking events riêng biệt với app events khác
- **Scalability**: Dễ scale riêng matchmaking service
- **Organization**: Clean separation of concerns

### Tại sao REST API + WebSocket?

- **REST API**: Actions (join, cancel) - dễ test, có response
- **WebSocket**: Real-time events (match_found, opponent_left) - low latency

## 🎯 Next Steps (Future Enhancements)

Các tính năng có thể thêm sau:

1. **Skill-based Matchmaking**: Match users với ELO rating tương đương
2. **Matchmaking Timeout**: Tự động cancel nếu chờ quá lâu
3. **Room Expiration**: Auto-close rooms inactive
4. **Reconnect Handling**: User có thể reconnect vào room cũ
5. **Database Persistence**: Lưu room history, statistics
6. **Redis Store**: Thay in-memory bằng Redis để scale horizontal
7. **Match History**: Track matches cho analytics
8. **Team Matchmaking**: Support 2v2, 3v3, etc.

## 📚 Code Structure

```
src/modules/matchmaking/
├── dto/
│   ├── match-found.dto.ts          # DTO cho MATCH_FOUND event
│   └── matchmaking-response.dto.ts # DTO cho API responses
├── enums/
│   └── user-state.enum.ts          # State machine enum
├── matchmaking.controller.ts        # REST API endpoints
├── matchmaking.gateway.ts           # WebSocket gateway
├── matchmaking.service.ts           # Business logic + in-memory store
├── matchmaking.service.spec.ts     # Unit tests
└── matchmaking.module.ts            # NestJS module
```

## 🤝 Contributing

Follow [CODING_GUIDE.md](../../CODING_GUIDE.md) khi modify module này.

## 📝 License

Same as main project.

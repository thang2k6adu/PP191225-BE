# 🎮 Hướng Dẫn Frontend - Hệ Thống Matchmaking & Rooms

> **Ngày cập nhật:** 07/01/2026  
> **Kiến trúc:** Room-centric với Redis Queue  
> **Đặc điểm:** Hybrid UX - Luôn có đường thoát cho user

---

## 📋 Mục Lục

1. [Tổng Quan Kiến Trúc](#tổng-quan-kiến-trúc)
2. [Flow Người Dùng](#flow-người-dùng)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket Events](#websocket-events)
5. [Implementation Guide](#implementation-guide)
6. [Error Handling](#error-handling)
7. [Best Practices](#best-practices)

---

## 🏗️ Tổng Quan Kiến Trúc

### Khái Niệm Cốt Lõi

```
┌─────────────────────────────────────────────────────┐
│  ROOM = Trung tâm của mọi thứ                      │
│  • PUBLIC rooms: Luôn sẵn sàng, ai cũng join được  │
│  • MATCH rooms: Tạo từ matchmaking, đóng khi rỗng  │
└─────────────────────────────────────────────────────┘
```

### Topics Có Sẵn

```typescript
const PUBLIC_TOPICS = ['math', 'coding', 'english', 'pomodoro'];
```

### Naming Convention

- **Public rooms:** `public-math`, `public-coding`, `public-english`, `public-pomodoro`
- **Match rooms:** `match-{uuid}` (VD: `match-a1b2c3d4-e5f6-7890-abcd-ef1234567890`)

---

## 👤 Flow Người Dùng

### Option 1: Join Public Room Trực Tiếp (KHUYẾN NGHỊ)

```
User vào app
  ↓
Xem danh sách Public Rooms
  ↓
Chọn topic yêu thích
  ↓
Join ngay (không chờ đợi)
  ↓
Học/làm việc với người khác
```

**Ưu điểm:**

- ⚡ Tức thì, không chờ
- 👥 Có thể có nhiều người (max 10)
- 🔄 Linh hoạt, vào ra tự do

### Option 2: Matchmaking (Tìm Đối Thủ 1v1)

```
User bấm "Find Match"
  ↓
Chọn topic
  ↓
┌─────────────────────────────┐
│ Đủ người? (>= 2)            │
├─────────────────────────────┤
│ ✅ YES → Tạo MATCH room     │
│    Vào ngay với 1 đối thủ   │
│                             │
│ ❌ NO → Vào queue chờ       │
│    Hiện suggestions:        │
│    "Join public room?"      │
└─────────────────────────────┘
```

**Ưu điểm:**

- 🎯 1v1 cụ thể với 1 người
- 🔒 Private room
- 🏆 Phù hợp cho thi đấu/pomodoro nghiêm túc

---

## 🔌 REST API Endpoints

### 1. Lấy Danh Sách Public Rooms

```http
GET /api/rooms/public
Authorization: Bearer {token}
```

**Response:**

```json
{
  "error": false,
  "code": 0,
  "message": "Success",
  "data": {
    "rooms": [
      {
        "id": "uuid-1",
        "type": "PUBLIC",
        "topic": "math",
        "livekitRoomName": "public-math",
        "status": "ACTIVE",
        "maxMembers": 10,
        "currentMembers": 3
      },
      {
        "id": "uuid-2",
        "topic": "coding",
        "livekitRoomName": "public-coding",
        "currentMembers": 1
      }
    ]
  }
}
```

**Khi nào dùng:**

- Hiện màn hình chọn room
- Refresh danh sách
- Khi user đang WAITING trong matchmaking (show suggestions)

---

### 2. Join Public Room

```http
POST /api/rooms/:roomId/join
Authorization: Bearer {token}
```

**Response:**

```json
{
  "error": false,
  "code": 0,
  "message": "Joined room successfully",
  "data": {
    "roomId": "uuid-1",
    "livekitRoomName": "public-math",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "topic": "math"
  }
}
```

**Sử dụng token:**

```typescript
import { Room } from 'livekit-client';

async function joinRoom(roomName: string, token: string) {
  const room = new Room();
  await room.connect(LIVEKIT_URL, token);

  // Bật camera/mic
  await room.localParticipant.enableCameraAndMicrophone();
}
```

---

### 3. Join Matchmaking Queue

```http
POST /api/matchmaking/join
Authorization: Bearer {token}
Content-Type: application/json

{
  "topic": "math"
}
```

**Response (MATCHED):**

```json
{
  "status": "MATCHED",
  "message": "Match found!",
  "matchData": {
    "roomId": "uuid-3",
    "livekitRoomName": "match-a1b2c3d4-...",
    "token": "eyJhbGciOiJIUzI1NiIs...",
    "opponentId": "user-uuid"
  }
}
```

**Response (WAITING):**

```json
{
  "status": "WAITING",
  "message": "Waiting for opponent...",
  "suggestPublicRooms": [
    {
      "id": "uuid-1",
      "topic": "math",
      "currentMembers": 3
    },
    {
      "id": "uuid-2",
      "topic": "math",
      "currentMembers": 1
    }
  ]
}
```

---

### 4. Cancel Matchmaking

```http
POST /api/matchmaking/cancel
Authorization: Bearer {token}
```

**Response:**

```json
{
  "message": "You have been removed from matchmaking queue"
}
```

---

### 5. Leave Room

```http
POST /api/rooms/:roomId/leave
Authorization: Bearer {token}
```

**Response:**

```json
{
  "message": "Left room successfully"
}
```

---

## 🔥 WebSocket Events

### Kết Nối

```typescript
import io from 'socket.io-client';

const socket = io('ws://localhost:3000/matchmaking', {
  auth: {
    token: accessToken, // JWT token
  },
});

socket.on('connect', () => {
  console.log('Connected to matchmaking');
});

socket.on('authenticated', (data) => {
  console.log('Authenticated:', data.userId);
});
```

### Events Nhận Từ Server

#### 1. `match_found`

Nhận khi có người match với bạn (bạn đang WAITING, có người join sau)

```typescript
socket.on('match_found', (data) => {
  console.log('Match found!', data);
  // {
  //   roomId: "uuid",
  //   livekitRoomName: "match-...",
  //   token: "eyJ...",
  //   opponentId: "user-uuid",
  //   message: "Match found!"
  // }

  // Redirect to room
  navigateToRoom(data.livekitRoomName, data.token);
});
```

#### 2. `error`

```typescript
socket.on('error', (data) => {
  console.error('WebSocket error:', data.message);
});
```

---

## 💻 Implementation Guide

### React/Next.js Example

```typescript
// hooks/useMatchmaking.ts
import { useState, useEffect } from 'react';
import { useSocket } from './useSocket';
import { api } from '@/lib/api';

export function useMatchmaking() {
  const socket = useSocket('/matchmaking');
  const [status, setStatus] = useState<'idle' | 'waiting' | 'matched'>('idle');
  const [matchData, setMatchData] = useState<any>(null);
  const [suggestions, setSuggestions] = useState<any[]>([]);

  useEffect(() => {
    socket.on('match_found', (data) => {
      setStatus('matched');
      setMatchData(data);
    });

    return () => {
      socket.off('match_found');
    };
  }, [socket]);

  const joinMatchmaking = async (topic: string) => {
    try {
      const response = await api.post('/matchmaking/join', { topic });

      if (response.data.status === 'MATCHED') {
        setStatus('matched');
        setMatchData(response.data.matchData);
      } else {
        setStatus('waiting');
        setSuggestions(response.data.suggestPublicRooms || []);
      }
    } catch (error) {
      console.error('Join matchmaking failed:', error);
    }
  };

  const cancelMatchmaking = async () => {
    try {
      await api.post('/matchmaking/cancel');
      setStatus('idle');
      setSuggestions([]);
    } catch (error) {
      console.error('Cancel failed:', error);
    }
  };

  return {
    status,
    matchData,
    suggestions,
    joinMatchmaking,
    cancelMatchmaking,
  };
}
```

### Component Usage

```typescript
// components/MatchmakingButton.tsx
import { useMatchmaking } from '@/hooks/useMatchmaking';
import { useState } from 'react';

export function MatchmakingButton() {
  const [selectedTopic, setSelectedTopic] = useState('math');
  const { status, matchData, suggestions, joinMatchmaking, cancelMatchmaking } = useMatchmaking();

  if (status === 'matched') {
    return (
      <div>
        <h3>Match Found! 🎉</h3>
        <button onClick={() => joinRoom(matchData)}>
          Join Room
        </button>
      </div>
    );
  }

  if (status === 'waiting') {
    return (
      <div>
        <p>Waiting for opponent...</p>
        <button onClick={cancelMatchmaking}>Cancel</button>

        {suggestions.length > 0 && (
          <div>
            <h4>Or join a public room now:</h4>
            {suggestions.map(room => (
              <button key={room.id} onClick={() => joinPublicRoom(room.id)}>
                {room.topic} ({room.currentMembers} online)
              </button>
            ))}
          </div>
        )}
      </div>
    );
  }

  return (
    <div>
      <select value={selectedTopic} onChange={(e) => setSelectedTopic(e.target.value)}>
        <option value="math">Math</option>
        <option value="coding">Coding</option>
        <option value="english">English</option>
        <option value="pomodoro">Pomodoro</option>
      </select>
      <button onClick={() => joinMatchmaking(selectedTopic)}>
        Find Match
      </button>
    </div>
  );
}
```

### Public Rooms List

```typescript
// components/PublicRoomsList.tsx
import { useState, useEffect } from 'react';
import { api } from '@/lib/api';

export function PublicRoomsList() {
  const [rooms, setRooms] = useState([]);

  useEffect(() => {
    loadRooms();
  }, []);

  const loadRooms = async () => {
    const response = await api.get('/rooms/public');
    setRooms(response.data.rooms);
  };

  const joinRoom = async (roomId: string) => {
    const response = await api.post(`/rooms/${roomId}/join`);
    const { livekitRoomName, token } = response.data;

    // Connect to LiveKit
    connectToLiveKit(livekitRoomName, token);
  };

  return (
    <div className="grid grid-cols-2 gap-4">
      {rooms.map(room => (
        <div key={room.id} className="border p-4 rounded">
          <h3>{room.topic}</h3>
          <p>{room.currentMembers}/{room.maxMembers} online</p>
          <button onClick={() => joinRoom(room.id)}>
            Join Now
          </button>
        </div>
      ))}
    </div>
  );
}
```

---

## ⚠️ Error Handling

### Common Errors

```typescript
try {
  await api.post('/matchmaking/join', { topic: 'math' });
} catch (error) {
  if (error.response?.status === 409) {
    // User already in queue or room
    alert('You are already in a room or queue');
  } else if (error.response?.status === 401) {
    // Not authenticated
    router.push('/login');
  }
}
```

### Disconnect Handling

```typescript
socket.on('disconnect', () => {
  console.log('Disconnected from matchmaking');
  // Auto cleanup: user được remove khỏi queue
  // Không cần làm gì thêm
});

socket.on('reconnect', () => {
  console.log('Reconnected');
  // Reload current state nếu cần
});
```

---

## ✅ Best Practices

### 1. **UX: Luôn Có Đường Thoát**

```typescript
// ❌ BAD: Chỉ có nút "Find Match"
<button>Find Match</button>

// ✅ GOOD: Có cả public rooms
<div>
  <button>Find 1v1 Match</button>
  <div>Or browse public rooms ↓</div>
  <PublicRoomsList />
</div>
```

### 2. **Show Public Rooms Khi WAITING**

```typescript
if (status === 'WAITING') {
  return (
    <>
      <LoadingSpinner />
      <p>Finding opponent...</p>

      {/* QUAN TRỌNG: Show suggestions */}
      <div className="mt-4">
        <p>Don't want to wait? Join a public room:</p>
        {suggestions.map(room => (
          <RoomCard key={room.id} room={room} />
        ))}
      </div>
    </>
  );
}
```

### 3. **Polling Public Rooms**

```typescript
// Refresh danh sách mỗi 10 giây để update currentMembers
useEffect(() => {
  const interval = setInterval(loadRooms, 10000);
  return () => clearInterval(interval);
}, []);
```

### 4. **Leave Room Khi Unmount**

```typescript
useEffect(() => {
  return () => {
    if (currentRoomId) {
      api.post(`/rooms/${currentRoomId}/leave`);
    }
  };
}, [currentRoomId]);
```

### 5. **LiveKit Integration**

```typescript
import { Room, RoomEvent } from 'livekit-client';

async function connectToLiveKit(roomName: string, token: string) {
  const room = new Room();

  // Subscribe to events
  room.on(RoomEvent.ParticipantConnected, (participant) => {
    console.log('Participant joined:', participant.identity);
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    console.log('Participant left:', participant.identity);
  });

  // Connect
  await room.connect(process.env.NEXT_PUBLIC_LIVEKIT_URL, token);

  // Enable camera & mic
  await room.localParticipant.enableCameraAndMicrophone();

  return room;
}
```

---

## 🎯 Recommended User Flow

### Landing Page

```
┌─────────────────────────────────────┐
│  🏠 Study Together                  │
├─────────────────────────────────────┤
│                                     │
│  [🎯 Quick Match (1v1)]            │
│                                     │
│  ──── or ────                       │
│                                     │
│  📚 Public Study Rooms              │
│  ┌─────────────────────────────┐   │
│  │ 📐 Math (3 online)          │   │
│  │ 💻 Coding (1 online)        │   │
│  │ 🗣️ English (5 online)       │   │
│  │ 🍅 Pomodoro (2 online)      │   │
│  └─────────────────────────────┘   │
└─────────────────────────────────────┘
```

### When User Clicks "Quick Match"

```
┌─────────────────────────────────────┐
│  Choose Your Topic                  │
│  ○ Math                             │
│  ○ Coding                           │
│  ○ English                          │
│  ○ Pomodoro                         │
│                                     │
│  [Find Match]                       │
└─────────────────────────────────────┘
        ↓
┌─────────────────────────────────────┐
│  🔍 Finding opponent...             │
│  ⏱️ Waiting time: 5s                │
│                                     │
│  [Cancel]                           │
│                                     │
│  ━━━━━━━━━━━━━━━━━━━━━━━━━          │
│                                     │
│  💡 Don't want to wait?             │
│  Join a public room now:            │
│                                     │
│  [📐 Math Room (3 online)] →       │
│  [💻 Coding Room (1 online)] →     │
└─────────────────────────────────────┘
```

---

## 🚀 Quick Start Checklist

- [ ] Install `socket.io-client` và `livekit-client`
- [ ] Setup WebSocket connection với `/matchmaking` namespace
- [ ] Implement `useMatchmaking()` hook
- [ ] Create Public Rooms list component
- [ ] Add "suggestions" UI khi WAITING
- [ ] Integrate LiveKit room connection
- [ ] Test flow: Join Match → WAITING → Click suggestion → Join public room
- [ ] Test flow: Join Match → MATCHED → Join private room
- [ ] Test flow: Join Public Room directly
- [ ] Handle leave room on unmount

---

## 📞 Support

Nếu có vấn đề, check:

1. **WebSocket không connect:** Verify JWT token hợp lệ
2. **Matchmaking không tìm thấy:** Check topic có đúng không (`math`, `coding`, `english`, `pomodoro`)
3. **LiveKit không connect:** Verify `NEXT_PUBLIC_LIVEKIT_URL` đúng
4. **Room full:** Public rooms có `maxMembers = 10`

**Debug endpoints:**

- `GET /api/matchmaking/stats` - Xem queue length
- `GET /api/rooms/public` - Xem rooms hiện tại

---

**Happy coding! 🚀**

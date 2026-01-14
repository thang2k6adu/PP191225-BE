# 🎮 Hướng Dẫn Frontend - Hệ Thống Matchmaking

> **Ngày cập nhật:** 14/01/2026  
> **Kiến trúc:** Random Matchmaking với Redis Queue  
> **Đặc điểm:** Real-time matching, Multi-instance support

---

## 📋 Mục Lục

1. [Tổng Quan Kiến Trúc](#tổng-quan-kiến-trúc)
2. [Flow Người Dùng](#flow-người-dùng)
3. [REST API Endpoints](#rest-api-endpoints)
4. [WebSocket Events](#websocket-events)
5. [Implementation Guide](#implementation-guide)
6. [State Management](#state-management)
7. [Error Handling](#error-handling)
8. [Best Practices](#best-practices)

---

## 🏗️ Tổng Quan Kiến Trúc

### Khái Niệm Cốt Lõi

```
┌─────────────────────────────────────────────────────┐
│  RANDOM MATCHMAKING = Tìm kiếm ngẫu nhiên           │
│  • Join existing room nếu có (< maxMembers)        │
│  • Nếu không có room → vào queue chờ               │
│  • Queue đủ người (≥2) → tạo room mới             │
└─────────────────────────────────────────────────────┘
```

### User States

```typescript
enum UserState {
  IDLE = 'IDLE', // Không trong matchmaking hoặc room
  WAITING = 'WAITING', // Đang chờ trong queue
  IN_ROOM = 'IN_ROOM', // Đã match, đang trong room
}
```

### Room Types

- **MATCH rooms:** Tạo từ matchmaking, tự động đóng khi empty
- **LiveKit Integration:** Mỗi room có `livekitRoomName` tương ứng

---

## 👤 Flow Người Dùng

### Matchmaking Flow

```
User bấm "Find Match"
  ↓
POST /matchmaking/join
  ↓
┌─────────────────────────────┐
│ Có room available?          │
├─────────────────────────────┤
│ ✅ YES → Join ngay          │
│    Return: MATCHED          │
│    + roomId, token          │
│                             │
│ ❌ NO → Vào queue chờ       │
│    Return: WAITING          │
│    Listen WebSocket event   │
└─────────────────────────────┘
  ↓
[WAITING] User khác join queue
  ↓
Queue đủ 2+ người
  ↓
🎮 Tạo room mới
  ↓
📡 WebSocket emit 'match_found'
   → Tất cả users trong match
```

### User Experience

**Scenario 1: Instant Match (Lucky)**

```
Click "Find Match" → Immediately get room token → Join LiveKit
```

**Scenario 2: Wait for Opponent**

```
Click "Find Match" → Show waiting UI → Get WebSocket notification → Join LiveKit
```

**Scenario 3: Cancel While Waiting**

```
Click "Find Match" → Waiting → Click "Cancel" → Back to idle
```

---

## 🔌 REST API Endpoints

### Base URL

```
https://your-api.com/api
```

### Authentication

Tất cả endpoints yêu cầu JWT Bearer token:

```http
Authorization: Bearer eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...
```

### 1. Join Matchmaking

```http
POST /matchmaking/join
Content-Type: application/json
Authorization: Bearer {token}

{}
```

**Response (MATCHED - Instant):**

```json
{
  "status": "MATCHED",
  "message": "Joined room successfully!",
  "matchData": {
    "roomId": "uuid-123",
    "livekitRoomName": "match-1705234567-abc123",
    "token": "eyJhbGciOiJIUzI1NiIs..."
  }
}
```

**Response (WAITING - Need to wait):**

```json
{
  "status": "WAITING",
  "message": "Waiting for more users..."
}
```

**Response (ERROR):**

```json
HTTP 409 Conflict
{
  "message": "User already in a room or queue"
}
```

```json
HTTP 409 Conflict
{
  "message": "Please connect to WebSocket before joining matchmaking"
}
```

**⚠️ Điều kiện:** User PHẢI connect WebSocket trước khi gọi API này!

---

### 2. Cancel Matchmaking

```http
POST /matchmaking/cancel
Authorization: Bearer {token}
```

**Response:**

```json
{
  "message": "You have been removed from matchmaking queue"
}
```

**Response (ERROR):**

```json
HTTP 409 Conflict
{
  "message": "User is not in matchmaking queue"
}
```

---

### 3. Get Statistics (Debug)

```http
GET /matchmaking/stats
Authorization: Bearer {token}
```

**Response:**

```json
{
  "onlineUsers": 25
}
```

---

## 🔥 WebSocket Events

### Namespace

```typescript
const namespace = '/matchmaking';
```

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

socket.on('connected', (data) => {
  console.log('Authenticated:', data.userId);
  // {
  //   userId: "user-123",
  //   message: "Successfully connected to matchmaking server"
  // }
});
```

### Authentication Error

```typescript
socket.on('error', (data) => {
  console.error('WebSocket error:', data.message);
  // Possible errors:
  // - "Authentication required"
  // - "Authentication failed"
});
```

---

### Events Nhận Từ Server

#### 1. `match_found` ⭐ QUAN TRỌNG NHẤT

Nhận khi matchmaking tìm thấy đối thủ:

```typescript
socket.on('match_found', (data) => {
  console.log('Match found!', data);
  // {
  //   roomId: "uuid-123",
  //   livekitRoomName: "match-1705234567-abc123",
  //   token: "eyJhbGci...",
  //   wsUrl: "ws://localhost:7880",
  //   matchedUsers: ["user-123", "user-456"],
  //   timestamp: "2026-01-14T10:30:00.000Z"
  // }

  // 🎯 Redirect to LiveKit room immediately
  joinLiveKitRoom(data.livekitRoomName, data.token);
});
```

#### 2. Room Events (Optional)

```typescript
// User có thể join room-specific events (không bắt buộc)
socket.emit('join_room', { roomId: 'room-123' });

socket.on('room_joined', (data) => {
  // { roomId: "room-123", message: "Successfully joined room" }
});

socket.on('player_joined', (data) => {
  // { userId: "user-456", roomId: "room-123" }
  console.log('Another player joined:', data.userId);
});
```

---

### Events Gửi Lên Server

#### 1. `join_room` (Optional)

```typescript
socket.emit('join_room', { roomId: 'room-123' });
```

#### 2. `leave_room` (Không khuyến nghị)

```typescript
socket.emit('leave_room');
// Server sẽ response: "Please use REST API POST /rooms/:roomId/leave"
```

---

## 💻 Implementation Guide

### React/Next.js Example

#### 1. WebSocket Hook

```typescript
// hooks/useMatchmakingSocket.ts
import { useEffect, useRef, useState } from 'react';
import io, { Socket } from 'socket.io-client';

export function useMatchmakingSocket(token: string) {
  const socketRef = useRef<Socket | null>(null);
  const [connected, setConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) return;

    const socket = io(`${process.env.NEXT_PUBLIC_WS_URL}/matchmaking`, {
      auth: { token },
      transports: ['websocket', 'polling'],
    });

    socket.on('connect', () => {
      setConnected(true);
      setError(null);
      console.log('🔌 Connected to matchmaking');
    });

    socket.on('connected', (data) => {
      console.log('✅ Authenticated:', data.userId);
    });

    socket.on('error', (data) => {
      setError(data.message);
      console.error('❌ WebSocket error:', data.message);
    });

    socket.on('disconnect', () => {
      setConnected(false);
      console.log('🔌 Disconnected from matchmaking');
    });

    socketRef.current = socket;

    return () => {
      socket.disconnect();
      socketRef.current = null;
      setConnected(false);
    };
  }, [token]);

  return {
    socket: socketRef.current,
    connected,
    error,
  };
}
```

#### 2. Matchmaking Hook

```typescript
// hooks/useMatchmaking.ts
import { useState, useEffect, useCallback } from 'react';
import { useMatchmakingSocket } from './useMatchmakingSocket';
import { api } from '@/lib/api';

type MatchmakingState = 'idle' | 'waiting' | 'matched';

interface MatchData {
  roomId: string;
  livekitRoomName: string;
  token: string;
  wsUrl?: string;
  matchedUsers?: string[];
}

export function useMatchmaking(token: string) {
  const { socket, connected } = useMatchmakingSocket(token);
  const [state, setState] = useState<MatchmakingState>('idle');
  const [matchData, setMatchData] = useState<MatchData | null>(null);
  const [error, setError] = useState<string | null>(null);

  // Listen for match found event
  useEffect(() => {
    if (!socket) return;

    const handleMatchFound = (data: any) => {
      console.log('🎉 Match found!', data);
      setState('matched');
      setMatchData({
        roomId: data.roomId,
        livekitRoomName: data.livekitRoomName,
        token: data.token,
        wsUrl: data.wsUrl,
        matchedUsers: data.matchedUsers,
      });
    };

    socket.on('match_found', handleMatchFound);

    return () => {
      socket.off('match_found', handleMatchFound);
    };
  }, [socket]);

  const joinMatchmaking = useCallback(async () => {
    if (!connected) {
      setError('WebSocket not connected');
      return;
    }

    try {
      setError(null);
      setState('waiting');

      const response = await api.post('/matchmaking/join');

      if (response.data.status === 'MATCHED') {
        // Instant match
        setState('matched');
        setMatchData(response.data.matchData);
      } else {
        // Waiting for others - will get WebSocket notification
        setState('waiting');
      }
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to join matchmaking');
      setState('idle');
    }
  }, [connected]);

  const cancelMatchmaking = useCallback(async () => {
    try {
      await api.post('/matchmaking/cancel');
      setState('idle');
      setMatchData(null);
      setError(null);
    } catch (err: any) {
      setError(err.response?.data?.message || 'Failed to cancel matchmaking');
    }
  }, []);

  const reset = useCallback(() => {
    setState('idle');
    setMatchData(null);
    setError(null);
  }, []);

  return {
    state,
    matchData,
    error,
    connected,
    joinMatchmaking,
    cancelMatchmaking,
    reset,
  };
}
```

#### 3. Matchmaking Component

```typescript
// components/MatchmakingButton.tsx
import { useState } from 'react';
import { useMatchmaking } from '@/hooks/useMatchmaking';
import { useAuth } from '@/hooks/useAuth';

export function MatchmakingButton() {
  const { token } = useAuth();
  const {
    state,
    matchData,
    error,
    connected,
    joinMatchmaking,
    cancelMatchmaking
  } = useMatchmaking(token);

  if (!connected) {
    return (
      <div className="text-center p-4">
        <div className="spinner"></div>
        <p>Connecting to matchmaking server...</p>
      </div>
    );
  }

  if (state === 'matched' && matchData) {
    return (
      <div className="text-center p-6 bg-green-50 rounded-lg">
        <h3 className="text-xl font-bold text-green-700 mb-4">
          🎉 Match Found!
        </h3>
        <p className="text-green-600 mb-4">
          Room: {matchData.livekitRoomName}
        </p>
        <button
          onClick={() => joinLiveKitRoom(matchData)}
          className="px-6 py-3 bg-green-600 text-white rounded-lg hover:bg-green-700"
        >
          Join Video Call
        </button>
      </div>
    );
  }

  if (state === 'waiting') {
    return (
      <div className="text-center p-6 bg-blue-50 rounded-lg">
        <div className="spinner mb-4"></div>
        <h3 className="text-lg font-semibold text-blue-700 mb-2">
          🔍 Finding opponent...
        </h3>
        <p className="text-blue-600 mb-4">
          Please wait while we find someone for you to match with
        </p>
        <button
          onClick={cancelMatchmaking}
          className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
        >
          Cancel
        </button>
      </div>
    );
  }

  return (
    <div className="text-center p-4">
      <button
        onClick={joinMatchmaking}
        disabled={!connected}
        className="px-8 py-4 bg-blue-600 text-white text-lg font-semibold rounded-lg hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed"
      >
        🎮 Find Match
      </button>

      {error && (
        <p className="mt-2 text-red-600 text-sm">{error}</p>
      )}
    </div>
  );
}
```

#### 4. LiveKit Integration

```typescript
// utils/livekit.ts
import { Room, RoomEvent } from 'livekit-client';

interface MatchData {
  livekitRoomName: string;
  token: string;
  wsUrl?: string;
}

export async function joinLiveKitRoom(matchData: MatchData) {
  const room = new Room();

  // Subscribe to events
  room.on(RoomEvent.Connected, () => {
    console.log('✅ Connected to LiveKit room');
  });

  room.on(RoomEvent.ParticipantConnected, (participant) => {
    console.log('👤 Participant joined:', participant.identity);
    // Update UI to show opponent
  });

  room.on(RoomEvent.ParticipantDisconnected, (participant) => {
    console.log('👤 Participant left:', participant.identity);
    // Update UI - opponent left
  });

  room.on(RoomEvent.Disconnected, (reason) => {
    console.log('❌ Disconnected from room:', reason);
    // Handle disconnect - maybe return to matchmaking
  });

  // Connect to room
  const wsUrl = matchData.wsUrl || process.env.NEXT_PUBLIC_LIVEKIT_URL;
  await room.connect(wsUrl, matchData.token);

  // Enable camera and microphone
  await room.localParticipant.enableCameraAndMicrophone();

  return room;
}
```

---

## 🏪 State Management

### Context Provider

```typescript
// contexts/MatchmakingContext.tsx
import { createContext, useContext, ReactNode } from 'react';
import { useMatchmaking } from '@/hooks/useMatchmaking';
import { useAuth } from '@/hooks/useAuth';

const MatchmakingContext = createContext<ReturnType<typeof useMatchmaking> | null>(null);

export function MatchmakingProvider({ children }: { children: ReactNode }) {
  const { token } = useAuth();
  const matchmaking = useMatchmaking(token);

  return (
    <MatchmakingContext.Provider value={matchmaking}>
      {children}
    </MatchmakingContext.Provider>
  );
}

export function useMatchmakingContext() {
  const context = useContext(MatchmakingContext);
  if (!context) {
    throw new Error('useMatchmakingContext must be used within MatchmakingProvider');
  }
  return context;
}
```

### Usage

```typescript
// App.tsx
function App() {
  return (
    <AuthProvider>
      <MatchmakingProvider>
        <Router>
          <Routes>
            <Route path="/match" element={<MatchmakingPage />} />
            <Route path="/room/:roomId" element={<RoomPage />} />
          </Routes>
        </Router>
      </MatchmakingProvider>
    </AuthProvider>
  );
}

// pages/MatchmakingPage.tsx
function MatchmakingPage() {
  const { state, matchData } = useMatchmakingContext();

  useEffect(() => {
    if (state === 'matched' && matchData) {
      // Navigate to room
      navigate(`/room/${matchData.roomId}`);
    }
  }, [state, matchData]);

  return <MatchmakingButton />;
}
```

---

## ⚠️ Error Handling

### Common Errors

```typescript
// API Errors
try {
  await api.post('/matchmaking/join');
} catch (error) {
  if (error.response?.status === 409) {
    if (error.response.data.message.includes('WebSocket')) {
      // User chưa connect WebSocket
      setError('Please wait for connection...');
      // Retry after socket connects
    } else if (error.response.data.message.includes('room or queue')) {
      // User đã trong room hoặc queue
      setError('You are already in a match');
    }
  } else if (error.response?.status === 401) {
    // Not authenticated
    redirectToLogin();
  }
}
```

### WebSocket Errors

```typescript
socket.on('error', (data) => {
  switch (data.message) {
    case 'Authentication required':
    case 'Authentication failed':
      // Token invalid hoặc missing
      refreshToken().then(() => {
        socket.connect(); // Reconnect with new token
      });
      break;
    default:
      console.error('Unknown WebSocket error:', data.message);
  }
});

socket.on('disconnect', (reason) => {
  if (reason === 'io server disconnect') {
    // Server kicked us out - probably auth issue
    refreshToken();
  }
  // Auto-reconnect handled by Socket.IO
});
```

### Network Errors

```typescript
// Retry logic for API calls
async function retryApiCall(fn: () => Promise<any>, maxRetries = 3) {
  let retries = 0;

  while (retries < maxRetries) {
    try {
      return await fn();
    } catch (error) {
      retries++;

      if (retries === maxRetries) {
        throw error;
      }

      // Exponential backoff
      await new Promise((resolve) => setTimeout(resolve, Math.pow(2, retries) * 1000));
    }
  }
}

// Usage
const joinMatchmaking = async () => {
  try {
    await retryApiCall(() => api.post('/matchmaking/join'));
  } catch (error) {
    setError('Failed to join matchmaking after multiple attempts');
  }
};
```

---

## ✅ Best Practices

### 1. **Connection Lifecycle**

```typescript
// ✅ GOOD: Wait for WebSocket before enabling UI
function MatchmakingButton() {
  const { connected } = useMatchmakingSocket(token);

  return (
    <button
      disabled={!connected}
      onClick={joinMatchmaking}
    >
      {connected ? 'Find Match' : 'Connecting...'}
    </button>
  );
}
```

### 2. **State Persistence**

```typescript
// ✅ GOOD: Save state to handle page refresh
useEffect(() => {
  // Save current state
  localStorage.setItem(
    'matchmaking_state',
    JSON.stringify({
      state,
      matchData,
      timestamp: Date.now(),
    }),
  );
}, [state, matchData]);

// On app load, check if user was in middle of matchmaking
useEffect(() => {
  const saved = localStorage.getItem('matchmaking_state');
  if (saved) {
    const { state, matchData, timestamp } = JSON.parse(saved);

    // Only restore if recent (< 5 minutes)
    if (Date.now() - timestamp < 5 * 60 * 1000) {
      if (state === 'waiting') {
        // Reconnect to get match updates
        setWaitingState();
      } else if (state === 'matched' && matchData) {
        // Redirect back to room
        navigate(`/room/${matchData.roomId}`);
      }
    }

    localStorage.removeItem('matchmaking_state');
  }
}, []);
```

### 3. **Graceful Degradation**

```typescript
// ✅ GOOD: Fallback when WebSocket fails
function MatchmakingWithFallback() {
  const [usePolling, setUsePolling] = useState(false);

  useEffect(() => {
    let pollInterval: NodeJS.Timeout;

    if (state === 'waiting' && usePolling) {
      // Poll every 2 seconds as fallback
      pollInterval = setInterval(async () => {
        try {
          const response = await api.get('/matchmaking/status');
          if (response.data.status === 'MATCHED') {
            setMatchData(response.data.matchData);
            setState('matched');
          }
        } catch (error) {
          console.error('Polling error:', error);
        }
      }, 2000);
    }

    return () => {
      if (pollInterval) clearInterval(pollInterval);
    };
  }, [state, usePolling]);

  // Enable polling if WebSocket fails
  useEffect(() => {
    if (wsError && state === 'waiting') {
      setUsePolling(true);
    }
  }, [wsError, state]);
}
```

### 4. **User Experience**

```typescript
// ✅ GOOD: Estimated wait time
function WaitingIndicator() {
  const [waitTime, setWaitTime] = useState(0);

  useEffect(() => {
    if (state === 'waiting') {
      const start = Date.now();
      const interval = setInterval(() => {
        setWaitTime(Math.floor((Date.now() - start) / 1000));
      }, 1000);

      return () => clearInterval(interval);
    }
  }, [state]);

  return (
    <div>
      <p>Finding opponent...</p>
      <p>Wait time: {waitTime}s</p>

      {waitTime > 30 && (
        <p className="text-yellow-600">
          Taking longer than usual. You can cancel and try again.
        </p>
      )}

      {waitTime > 60 && (
        <button onClick={cancelAndRetry}>
          Cancel & Retry
        </button>
      )}
    </div>
  );
}
```

### 5. **Resource Cleanup**

```typescript
// ✅ GOOD: Cleanup on unmount
useEffect(() => {
  return () => {
    // Cancel matchmaking if component unmounts while waiting
    if (state === 'waiting') {
      api.post('/matchmaking/cancel').catch(console.error);
    }

    // Disconnect WebSocket
    if (socket?.connected) {
      socket.disconnect();
    }
  };
}, []);
```

---

## 🚀 Quick Start Checklist

- [ ] Install dependencies: `socket.io-client`, `livekit-client`
- [ ] Setup environment variables: `NEXT_PUBLIC_WS_URL`, `NEXT_PUBLIC_LIVEKIT_URL`
- [ ] Implement authentication hook with JWT token
- [ ] Create `useMatchmakingSocket` hook for WebSocket connection
- [ ] Create `useMatchmaking` hook for matchmaking logic
- [ ] Build UI components: MatchmakingButton, WaitingIndicator
- [ ] Integrate LiveKit for video calls
- [ ] Test flow: Connect → Find Match → Wait → Get match_found → Join LiveKit
- [ ] Test error cases: No internet, token expired, server down
- [ ] Implement cleanup on unmount and page refresh
- [ ] Add loading states and error messages

---

## 🐛 Debugging Guide

### Check WebSocket Connection

```javascript
// In browser console:
socket.connected; // true/false
socket.id; // socket ID
socket.auth; // should have token
```

### Check User State

```http
GET /matchmaking/stats
```

### Common Issues

1. **"Please connect to WebSocket before joining matchmaking"**
   - WebSocket chưa connect xong
   - Wait for `connected: true` trước khi call API

2. **"User already in a room or queue"**
   - User đã trong trạng thái WAITING hoặc IN_ROOM
   - Check state trước khi join

3. **WebSocket không connect**
   - Check JWT token hợp lệ
   - Check CORS settings
   - Check network firewall

4. **match_found không nhận được**
   - Check WebSocket still connected
   - Check user đã join đúng namespace `/matchmaking`

---

## 📞 Support

**Debug endpoints:**

- `GET /matchmaking/stats` - Online users count
- WebSocket events: `connect`, `disconnect`, `error`

**Logs to check:**

- WebSocket connection/disconnection
- API call responses
- match_found event payload

---

**Happy matching! 🎮**

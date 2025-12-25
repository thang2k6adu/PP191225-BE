# 📱 Frontend Integration Guide - Multi-Session Task Tracking

## 📋 Tổng Quan

Hệ thống tracking mới cho phép:

- ✅ Mỗi user chỉ có **1 task active** tại một thời điểm
- ✅ Mỗi lần activate task tạo **session tracking mới**
- ✅ **Pause/Resume** session (tạm dừng/tiếp tục)
- ✅ **Stop** session (kết thúc và tính duration)
- ✅ **Auto-complete** task khi `progress >= 100%`
- ✅ Xem **lịch sử tất cả sessions** của task

---

## 🎯 User Flow (Luồng Người Dùng)

### Recommended Flow

```
1. User Login
   ↓
2. Matchmaking (Tìm phòng/đối thủ)
   ↓
3. Match Found! → Hiển thị Task Selection Dialog
   ↓
4. User chọn Task từ danh sách
   ↓
5. Activate Task (Bắt đầu tracking tự động)
   ↓
6. Vào Room Screen (Task info hiển thị ở header/sidebar)
   ↓
7. Làm việc trong room (có thể Pause/Resume)
   ↓
8. Stop Session (Kết thúc)
   ↓
9. Xem kết quả (Progress, EXP earned)
   ↓
10. Quay lại Matchmaking hoặc chọn Task khác
```

### Detailed Flow

#### Step 1: Matchmaking

```typescript
// User tham gia matchmaking
const matchResult = await joinMatchmaking();

// Khi tìm được phòng/đối thủ
if (matchResult.success) {
  // Hiển thị dialog chọn task NGAY LẬP TỨC
  showTaskSelectionDialog();
}
```

#### Step 2: Task Selection Dialog

```typescript
// Fetch danh sách tasks của user
const tasks = await fetchUserTasks();

// Hiển thị dialog với danh sách tasks
const selectedTask = await showTaskSelectionDialog({
  tasks: tasks,
  title: 'Chọn Task để làm việc',
  description: 'Bạn đã tìm được phòng! Hãy chọn task muốn làm.',
});

// User chọn task
if (selectedTask) {
  // Activate task (tự động tạo tracking session)
  const result = await activateTask(selectedTask.id);

  // Lưu thông tin để hiển thị trong room
  saveActiveTaskToState(result.data.task);
  saveActiveSessionToState(result.data.session);

  // Chuyển vào room screen
  navigateToRoomScreen({
    roomId: matchResult.roomId,
    task: result.data.task,
    session: result.data.session,
  });
}
```

#### Step 3: Room Screen với Task Info

```typescript
// Room screen hiển thị:
// 1. Room info (members, chat, etc.)
// 2. Task info (ở header, sidebar, hoặc floating card)

function RoomScreen({ roomId, task, session }) {
  return (
    <div className="room-screen">
      {/* Task Info Header/Sidebar */}
      <TaskInfoPanel
        task={task}
        session={session}
        onPause={handlePause}
        onResume={handleResume}
        onStop={handleStop}
      />

      {/* Room Content */}
      <RoomContent roomId={roomId} />
    </div>
  );
}
```

#### Step 4: Working Session trong Room

```typescript
// Session đang active, user có thể:
// - Pause: Tạm dừng (nghỉ giải lao)
// - Resume: Tiếp tục
// - Stop: Kết thúc session

// Khi stop session
const result = await stopSession(sessionId);

// Hiển thị kết quả
showSessionSummary({
  duration: result.duration,
  expEarned: result.expEarned,
  taskProgress: updatedTask.progress,
});

// Có thể ở lại room hoặc rời phòng
```

#### Step 5: Next Action

```typescript
// Sau khi stop session, user có thể:

// Option 1: Tiếp tục ở trong room (không tracking)
await stayInRoom();

// Option 2: Rời phòng và matchmaking lại
await leaveRoomAndMatchmaking();

// Option 3: Chọn task khác và tiếp tục tracking
await selectAnotherTask();
```

### UI Flow Diagram

```
┌─────────────────────────────────────────────────────────┐
│                    LOGIN SCREEN                         │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│                MATCHMAKING SCREEN                       │
│  [Finding opponent...] or [Room joined!]               │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│          TASK SELECTION DIALOG (Popup)                  │
│  ┌───────────────────────────────────────────────────┐ │
│  │ 🎯 Chọn Task để làm việc                          │ │
│  │                                                   │ │
│  │ ○ Task 1: Implement Login (8h) - 25% done        │ │
│  │   ⏱ 2h spent | 📊 Progress: ████░░░░░░           │ │
│  │                                                   │ │
│  │ ○ Task 2: Fix Bug #123 (2h) - 0% done            │ │
│  │   ⏱ 0h spent | 📊 Progress: ░░░░░░░░░░           │ │
│  │                                                   │ │
│  │ ○ Task 3: Setup DB (4h) - 100% done ✓            │ │
│  │   ⏱ 4h spent | 📊 Progress: ██████████           │ │
│  │                                                   │ │
│  │           [Confirm Selection]                     │ │
│  └───────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│               ROOM SCREEN (with Task Info)              │
│  ┌─────────────────────────────────────────────────┐   │
│  │ 📋 Task: Implement Login        ⏱ 01:23:45     │   │
│  │ 📊 Progress: ████████░░ 35%     [⏸ Pause] [⏹]  │   │
│  └─────────────────────────────────────────────────┘   │
│                                                         │
│  Room Members:                                          │
│  • You (Ready)                                          │
│  • Partner (Ready)                                      │
│                                                         │
│  [Chat/Collaboration Area]                              │
│                                                         │
│  [Leave Room]                                           │
└─────────────────────────────────────────────────────────┘
                          ↓
┌─────────────────────────────────────────────────────────┐
│             SESSION SUMMARY (Dialog)                    │
│  ✅ Session Completed!                                  │
│  ⏱ Duration: 1h 23m                                     │
│  🏆 EXP Earned: 4,980 seconds                           │
│  📊 Task Progress: 35% → 52%                            │
│                                                         │
│  [Stay in Room] [Leave & Matchmaking] [New Task]       │
└─────────────────────────────────────────────────────────┘
```

### Task Info Display Options

Có 3 cách hiển thị task info trong room screen:

#### Option 1: Header Bar (Recommended)

```typescript
<div className="room-header">
  <div className="task-info">
    <span className="task-name">📋 {task.name}</span>
    <span className="timer">⏱ {formatTime(currentTime)}</span>
    <span className="progress">📊 {task.progress.toFixed(1)}%</span>
  </div>
  <div className="task-controls">
    <button onClick={onPause}>⏸ Pause</button>
    <button onClick={onStop}>⏹ Stop</button>
  </div>
</div>
```

#### Option 2: Sidebar Panel

```typescript
<div className="room-layout">
  <aside className="task-sidebar">
    <h3>Current Task</h3>
    <div className="task-details">
      <p>{task.name}</p>
      <div className="progress-bar">
        <div style={{ width: `${task.progress}%` }} />
      </div>
      <p>Time: {formatTime(currentTime)}</p>
      <p>Progress: {task.progress.toFixed(1)}%</p>
      <button onClick={onPause}>Pause</button>
      <button onClick={onStop}>Stop</button>
    </div>
  </aside>
  <main className="room-content">
    {/* Room content */}
  </main>
</div>
```

#### Option 3: Floating Card

```typescript
<div className="floating-task-card">
  <div className="card-header">
    <span>📋 {task.name}</span>
    <button onClick={toggleMinimize}>−</button>
  </div>
  {!minimized && (
    <div className="card-body">
      <p>⏱ {formatTime(currentTime)}</p>
      <div className="progress-bar">
        <div style={{ width: `${task.progress}%` }} />
      </div>
      <div className="controls">
        <button onClick={onPause}>⏸</button>
        <button onClick={onStop}>⏹</button>
      </div>
    </div>
  )}
</div>
```

### Implementation Example

```typescript
// Main App Flow
class TaskTrackingApp {
  async start() {
    // 1. Login
    await this.login();

    // 2. Matchmaking
    const matchResult = await this.matchmaking();

    if (matchResult.success) {
      // 3. Show Task Selection Dialog
      await this.showTaskSelectionDialog(matchResult.roomId);
    }
  }

  async showTaskSelectionDialog(roomId: string) {
    // Fetch user's tasks
    const tasks = await this.fetchTasks();

    // Show dialog
    const selectedTask = await this.showTaskDialog({
      tasks: tasks,
      title: 'Chọn Task để làm việc',
      description: 'Bạn đã tìm được phòng! Hãy chọn task muốn làm.',
    });

    if (selectedTask) {
      // 4. Activate task and start tracking
      const result = await activateTask(selectedTask.id);

      // 5. Navigate to room screen with task info
      await this.navigateToRoom({
        roomId: roomId,
        task: result.task,
        session: result.session,
      });
    }
  }

  async navigateToRoom({ roomId, task, session }) {
    // Show room screen with task info in header/sidebar
    this.showRoomScreen({
      roomId: roomId,
      task: task,
      session: session,
    });

    // Task info is displayed in room header/sidebar
    // User can pause/resume/stop from within the room
  }

  async handleStopSession(sessionId: string) {
    // Stop the session
    const result = await stopSession(sessionId);

    // Show summary dialog
    await this.showSessionSummary(result);

    // Ask for next action
    const nextAction = await this.askNextAction();

    if (nextAction === 'stayInRoom') {
      // Stay in room without tracking
      return;
    } else if (nextAction === 'leaveAndMatch') {
      await this.leaveRoom();
      await this.matchmaking();
    } else if (nextAction === 'newTask') {
      await this.showTaskSelectionDialog(this.currentRoomId);
    }
  }
}
```

### Important Rules

1. **Matchmaking First**: User phải join matchmaking trước khi chọn task
2. **Dialog After Match**: Task selection dialog hiển thị NGAY sau khi tìm được phòng
3. **One Active Task**: Chỉ 1 task active tại một thời điểm
4. **Task in Room**: Task info hiển thị trong room screen (header/sidebar/floating)
5. **Session Management**: Mỗi lần activate tạo session mới
6. **Clear Flow**: Luôn có next action rõ ràng sau mỗi bước

---

## �🔑 Authentication

Tất cả API đều yêu cầu Bearer Token:

```typescript
headers: {
  'Authorization': `Bearer ${accessToken}`,
  'Content-Type': 'application/json'
}
```

---

## 📊 Data Models

### Task Model

```typescript
interface Task {
  id: string;
  name: string;
  estimateHours: number; // Số giờ ước tính
  deadline: string; // ISO 8601 date
  status: 'PLANNED' | 'ACTIVE' | 'DONE';
  isActive: boolean;
  progress: number; // 0-100%
  totalTimeSpent: number; // Tổng seconds đã làm
  userId: string;
  createdAt: string;
  updatedAt: string;
}
```

### TrackingSession Model

```typescript
interface TrackingSession {
  id: string;
  taskId: string;
  userId: string;
  startTime: string; // ISO 8601 datetime
  endTime: string | null; // null nếu chưa kết thúc
  duration: number; // Seconds (chỉ có khi endTime != null)
  status: 'active' | 'paused' | 'stopped';
  expEarned: number; // Seconds của session
  createdAt: string;
  updatedAt: string;
}
```

---

## 🚀 API Endpoints

### 1. Activate Task (Bắt Đầu Làm Task)

**Endpoint:** `POST /api/tasks/:id/activate`

**Mô tả:**

- Activate task và tạo session tracking mới
- Tự động deactivate tất cả tasks khác
- Tự động stop tất cả sessions khác đang active/paused

**Request:**

```typescript
// URL: POST /api/tasks/abc-123/activate
// No body required
```

**Response:**

```typescript
{
  "error": false,
  "code": 0,
  "message": "Task activated",
  "data": {
    "task": {
      "id": "abc-123",
      "name": "Implement Login Feature",
      "estimateHours": 8,
      "deadline": "2025-12-31T00:00:00.000Z",
      "status": "ACTIVE",
      "isActive": true,
      "progress": 0,
      "totalTimeSpent": 0,
      "userId": "user-id",
      "createdAt": "2025-12-25T03:00:00.000Z",
      "updatedAt": "2025-12-25T10:00:00.000Z"
    },
    "session": {
      "id": "session-123",
      "taskId": "abc-123",
      "userId": "user-id",
      "startTime": "2025-12-25T10:00:00.000Z",
      "endTime": null,
      "duration": 0,
      "status": "active",
      "expEarned": 0,
      "createdAt": "2025-12-25T10:00:00.000Z",
      "updatedAt": "2025-12-25T10:00:00.000Z"
    }
  }
}
```

**Error Cases:**

```typescript
// 400 - Task đã DONE
{
  "error": true,
  "code": 400,
  "message": "Cannot activate a completed task"
}

// 404 - Task không tồn tại
{
  "error": true,
  "code": 404,
  "message": "Task not found"
}

// 403 - Không phải task của user
{
  "error": true,
  "code": 403,
  "message": "Forbidden"
}
```

**Frontend Logic:**

```typescript
async function activateTask(taskId: string) {
  try {
    const response = await fetch(`/api/tasks/${taskId}/activate`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.message);
    }

    // Lưu session ID để dùng cho pause/resume/stop
    const sessionId = result.data.session.id;
    localStorage.setItem('activeSessionId', sessionId);

    // Update UI
    updateTaskUI(result.data.task);
    startTimer(result.data.session.startTime);

    return result.data;
  } catch (error) {
    console.error('Failed to activate task:', error);
    throw error;
  }
}
```

---

### 2. Pause Session (Tạm Dừng)

**Endpoint:** `POST /api/tracking-sessions/:id/pause`

**Mô tả:**

- Tạm dừng session (có thể resume sau)
- Session vẫn tồn tại, chỉ đổi status
- `endTime` vẫn = `null`

**Request:**

```typescript
// URL: POST /api/tracking-sessions/session-123/pause
// No body required
```

**Response:**

```typescript
{
  "error": false,
  "code": 0,
  "message": "Session paused",
  "data": {
    "id": "session-123",
    "taskId": "abc-123",
    "userId": "user-id",
    "startTime": "2025-12-25T10:00:00.000Z",
    "endTime": null,
    "duration": 0,
    "status": "paused",
    "expEarned": 0,
    "currentDuration": 300,  // Thời gian hiện tại (seconds) - chỉ để hiển thị
    "createdAt": "2025-12-25T10:00:00.000Z",
    "updatedAt": "2025-12-25T10:05:00.000Z"
  }
}
```

**Error Cases:**

```typescript
// 400 - Session không active
{
  "error": true,
  "code": 400,
  "message": "Session is not active"
}

// 404 - Session không tồn tại
{
  "error": true,
  "code": 404,
  "message": "Session not found"
}
```

**Frontend Logic:**

```typescript
async function pauseSession(sessionId: string) {
  try {
    const response = await fetch(`/api/tracking-sessions/${sessionId}/pause`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.message);
    }

    // Stop timer
    stopTimer();

    // Update UI to show paused state
    updateSessionStatus('paused');

    return result.data;
  } catch (error) {
    console.error('Failed to pause session:', error);
    throw error;
  }
}
```

---

### 3. Resume Session (Tiếp Tục)

**Endpoint:** `POST /api/tracking-sessions/:id/resume`

**Mô tả:**

- Tiếp tục session đã pause
- Chỉ đổi status về `active`
- Timer tiếp tục từ `startTime` ban đầu

**Request:**

```typescript
// URL: POST /api/tracking-sessions/session-123/resume
// No body required
```

**Response:**

```typescript
{
  "error": false,
  "code": 0,
  "message": "Session resumed",
  "data": {
    "id": "session-123",
    "taskId": "abc-123",
    "userId": "user-id",
    "startTime": "2025-12-25T10:00:00.000Z",
    "endTime": null,
    "duration": 0,
    "status": "active",
    "expEarned": 0,
    "createdAt": "2025-12-25T10:00:00.000Z",
    "updatedAt": "2025-12-25T10:10:00.000Z"
  }
}
```

**Error Cases:**

```typescript
// 400 - Session không paused
{
  "error": true,
  "code": 400,
  "message": "Session is not paused"
}
```

**Frontend Logic:**

```typescript
async function resumeSession(sessionId: string) {
  try {
    const response = await fetch(`/api/tracking-sessions/${sessionId}/resume`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.message);
    }

    // Resume timer from original startTime
    startTimer(result.data.startTime);

    // Update UI
    updateSessionStatus('active');

    return result.data;
  } catch (error) {
    console.error('Failed to resume session:', error);
    throw error;
  }
}
```

---

### 4. Stop Session (Kết Thúc)

**Endpoint:** `POST /api/tracking-sessions/:id/stop`

**Mô tả:**

- Kết thúc session và tính duration
- Set `endTime` = now
- Update `task.progress` và `task.totalTimeSpent`
- **Auto-complete task** nếu `progress >= 100%`

**Request:**

```typescript
// URL: POST /api/tracking-sessions/session-123/stop
// No body required
```

**Response:**

```typescript
{
  "error": false,
  "code": 0,
  "message": "Session stopped",
  "data": {
    "id": "session-123",
    "taskId": "abc-123",
    "userId": "user-id",
    "startTime": "2025-12-25T10:00:00.000Z",
    "endTime": "2025-12-25T10:30:00.000Z",
    "duration": 1800,           // 30 minutes = 1800 seconds
    "status": "stopped",
    "expEarned": 1800,          // 1800 seconds
    "createdAt": "2025-12-25T10:00:00.000Z",
    "updatedAt": "2025-12-25T10:30:00.000Z"
  }
}
```

**Error Cases:**

```typescript
// 400 - Session đã stopped
{
  "error": true,
  "code": 400,
  "message": "Session is already stopped"
}
```

**Frontend Logic:**

```typescript
async function stopSession(sessionId: string) {
  try {
    const response = await fetch(`/api/tracking-sessions/${sessionId}/stop`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.message);
    }

    // Stop timer
    stopTimer();

    // Clear active session
    localStorage.removeItem('activeSessionId');

    // Update UI
    updateSessionStatus('stopped');
    showSessionSummary(result.data);

    // Refresh task to get updated progress
    await refreshTask(result.data.taskId);

    return result.data;
  } catch (error) {
    console.error('Failed to stop session:', error);
    throw error;
  }
}
```

---

### 5. Get Progress (Xem Tiến Độ)

**Endpoint:** `GET /api/tracking-sessions/progress?taskId={taskId}`

**Mô tả:**

- Lấy progress và tất cả sessions của task
- Bao gồm cả session đang active (nếu có)

**Request:**

```typescript
// URL: GET /api/tracking-sessions/progress?taskId=abc-123
```

**Response:**

```typescript
{
  "error": false,
  "code": 0,
  "message": "Success",
  "data": {
    "progress": 35.42,                    // % hoàn thành
    "totalTimeSpent": 10200,              // Tổng seconds
    "estimateSeconds": 28800,             // 8 hours * 3600
    "expEarned": 10200,                   // totalTimeSpent in seconds
    "sessions": [
      {
        "id": "session-1",
        "startTime": "2025-12-25T08:00:00.000Z",
        "endTime": "2025-12-25T10:00:00.000Z",
        "duration": 7200,                 // 2 hours
        "status": "stopped",
        "expEarned": 7200,                // 7200 seconds
        "createdAt": "2025-12-25T08:00:00.000Z"
      },
      {
        "id": "session-2",
        "startTime": "2025-12-25T11:00:00.000Z",
        "endTime": "2025-12-25T12:00:00.000Z",
        "duration": 3600,                 // 1 hour
        "status": "stopped",
        "expEarned": 3600,                // 3600 seconds
        "createdAt": "2025-12-25T11:00:00.000Z"
      }
    ],
    "currentSession": null                // hoặc session object nếu đang active
  }
}
```

**Frontend Logic:**

```typescript
async function getTaskProgress(taskId: string) {
  try {
    const response = await fetch(`/api/tracking-sessions/progress?taskId=${taskId}`, {
      headers: {
        Authorization: `Bearer ${token}`,
      },
    });

    const result = await response.json();

    if (result.error) {
      throw new Error(result.message);
    }

    // Update progress bar
    updateProgressBar(result.data.progress);

    // Show time spent
    displayTimeSpent(result.data.totalTimeSpent);

    // Show sessions history
    renderSessionsHistory(result.data.sessions);

    return result.data;
  } catch (error) {
    console.error('Failed to get progress:', error);
    throw error;
  }
}
```

---

## 🎯 Complete Flow Example

### React/Vue Component Example

```typescript
import { useState, useEffect, useRef } from 'react';

interface TaskTrackingProps {
  taskId: string;
  token: string;
}

export function TaskTracking({ taskId, token }: TaskTrackingProps) {
  const [task, setTask] = useState<Task | null>(null);
  const [session, setSession] = useState<TrackingSession | null>(null);
  const [currentTime, setCurrentTime] = useState(0);
  const timerRef = useRef<NodeJS.Timeout | null>(null);

  // Load task and check for active session
  useEffect(() => {
    loadTask();
    loadProgress();
  }, [taskId]);

  // Timer effect
  useEffect(() => {
    if (session?.status === 'active' && session.startTime) {
      startTimer(session.startTime);
    } else {
      stopTimer();
    }

    return () => stopTimer();
  }, [session?.status]);

  const loadTask = async () => {
    const response = await fetch(`/api/tasks/${taskId}`, {
      headers: { 'Authorization': `Bearer ${token}` }
    });
    const result = await response.json();
    setTask(result.data);
  };

  const loadProgress = async () => {
    const response = await fetch(
      `/api/tracking-sessions/progress?taskId=${taskId}`,
      {
        headers: { 'Authorization': `Bearer ${token}` }
      }
    );
    const result = await response.json();

    if (result.data.currentSession) {
      setSession(result.data.currentSession);
    }
  };

  const startTimer = (startTime: string) => {
    stopTimer();

    const updateTime = () => {
      const elapsed = Math.floor(
        (Date.now() - new Date(startTime).getTime()) / 1000
      );
      setCurrentTime(elapsed);
    };

    updateTime();
    timerRef.current = setInterval(updateTime, 1000);
  };

  const stopTimer = () => {
    if (timerRef.current) {
      clearInterval(timerRef.current);
      timerRef.current = null;
    }
  };

  const handleActivate = async () => {
    try {
      const response = await fetch(`/api/tasks/${taskId}/activate`, {
        method: 'POST',
        headers: { 'Authorization': `Bearer ${token}` }
      });

      const result = await response.json();

      if (!result.error) {
        setTask(result.data.task);
        setSession(result.data.session);
        localStorage.setItem('activeSessionId', result.data.session.id);
      }
    } catch (error) {
      console.error('Activate failed:', error);
    }
  };

  const handlePause = async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `/api/tracking-sessions/${session.id}/pause`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const result = await response.json();

      if (!result.error) {
        setSession(result.data);
      }
    } catch (error) {
      console.error('Pause failed:', error);
    }
  };

  const handleResume = async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `/api/tracking-sessions/${session.id}/resume`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const result = await response.json();

      if (!result.error) {
        setSession(result.data);
      }
    } catch (error) {
      console.error('Resume failed:', error);
    }
  };

  const handleStop = async () => {
    if (!session) return;

    try {
      const response = await fetch(
        `/api/tracking-sessions/${session.id}/stop`,
        {
          method: 'POST',
          headers: { 'Authorization': `Bearer ${token}` }
        }
      );

      const result = await response.json();

      if (!result.error) {
        setSession(null);
        localStorage.removeItem('activeSessionId');
        await loadTask(); // Refresh to get updated progress
        await loadProgress();
      }
    } catch (error) {
      console.error('Stop failed:', error);
    }
  };

  const formatTime = (seconds: number) => {
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    return `${hours.toString().padStart(2, '0')}:${minutes.toString().padStart(2, '0')}:${secs.toString().padStart(2, '0')}`;
  };

  return (
    <div className="task-tracking">
      <h2>{task?.name}</h2>

      {/* Progress Bar */}
      <div className="progress-bar">
        <div
          className="progress-fill"
          style={{ width: `${task?.progress || 0}%` }}
        />
        <span>{task?.progress.toFixed(2)}%</span>
      </div>

      {/* Timer */}
      {session && (
        <div className="timer">
          <h3>{formatTime(currentTime)}</h3>
          <p>Status: {session.status}</p>
        </div>
      )}

      {/* Controls */}
      <div className="controls">
        {!session && task?.status !== 'DONE' && (
          <button onClick={handleActivate}>Start</button>
        )}

        {session?.status === 'active' && (
          <>
            <button onClick={handlePause}>Pause</button>
            <button onClick={handleStop}>Stop</button>
          </>
        )}

        {session?.status === 'paused' && (
          <>
            <button onClick={handleResume}>Resume</button>
            <button onClick={handleStop}>Stop</button>
          </>
        )}
      </div>
    </div>
  );
}
```

---

### 3. States & Transitions

```
PLANNED ──[Start]──> ACTIVE ──[Pause]──> ACTIVE (paused)
                       │                      │
                       │                  [Resume]
                       │                      │
                       └──[Stop]──> Show Summary
                                         │
                                    [Continue] or [New Task]
```

---

## ⚠️ Important Notes

### 1. Auto-Complete Behavior

- Task tự động chuyển sang `DONE` khi `progress >= 100%`
- Điều này xảy ra khi **stop session**
- Frontend cần handle case này và show notification

```typescript
async function stopSession(sessionId: string) {
  const result = await stopSessionAPI(sessionId);

  // Refresh task để lấy status mới
  const task = await getTask(result.data.taskId);

  if (task.status === 'DONE') {
    // Show completion celebration
    showCompletionModal({
      taskName: task.name,
      totalTime: task.totalTimeSpent,
      expEarned: result.data.expEarned,
    });
  }
}
```

### 2. Single Active Task Rule

- Chỉ 1 task active tại một thời điểm
- Khi activate task mới, task cũ tự động deactivate
- Session cũ tự động stop
- Frontend nên show warning trước khi switch

```typescript
async function activateTask(newTaskId: string) {
  const activeTask = await getActiveTask();

  if (activeTask && activeTask.id !== newTaskId) {
    const confirmed = await showConfirmDialog(
      `You have an active task "${activeTask.name}". ` +
        `Switching will stop the current session. Continue?`,
    );

    if (!confirmed) return;
  }

  await activateTaskAPI(newTaskId);
}
```

### 3. Timer Accuracy

- Timer chạy trên client, tính từ `startTime`
- Không cần sync với server mỗi giây
- Chỉ sync khi pause/resume/stop

```typescript
// ✅ GOOD - Calculate from startTime
const elapsed = Math.floor((Date.now() - new Date(session.startTime).getTime()) / 1000);

// ❌ BAD - Don't call API every second
setInterval(() => {
  fetch('/api/tracking-sessions/current-time'); // NO!
}, 1000);
```

### 4. Offline Handling

- Lưu `startTime` vào localStorage
- Khi online lại, tính lại elapsed time
- Gọi API stop/pause để sync

```typescript
// Save to localStorage when activate
localStorage.setItem('sessionStartTime', session.startTime);

// On app resume/reconnect
window.addEventListener('online', async () => {
  const startTime = localStorage.getItem('sessionStartTime');
  if (startTime) {
    // Calculate elapsed time
    const elapsed = Math.floor((Date.now() - new Date(startTime).getTime()) / 1000);

    // Sync with server
    await syncSession(sessionId, elapsed);
  }
});
```

---

## 🧪 Testing Checklist

### Functional Tests

- [ ] Start task → session created, timer starts
- [ ] Pause session → timer stops, can resume
- [ ] Resume session → timer continues from original start time
- [ ] Stop session → duration calculated, progress updated
- [ ] Switch tasks → old session stopped, new session created
- [ ] Auto-complete → task becomes DONE when progress >= 100%
- [ ] View progress → shows all sessions and current progress

### Edge Cases

- [ ] Start task while another is active
- [ ] Pause already paused session (should error)
- [ ] Resume non-paused session (should error)
- [ ] Stop already stopped session (should error)
- [ ] Activate DONE task (should error)
- [ ] Network error during operation
- [ ] App backgrounded/foregrounded
- [ ] Browser refresh with active session

### UI/UX Tests

- [ ] Timer displays correctly (HH:MM:SS)
- [ ] Progress bar updates after stop
- [ ] Session history shows all sessions
- [ ] Completion celebration shows
- [ ] Warning shows when switching tasks
- [ ] Loading states during API calls
- [ ] Error messages are user-friendly

---

## 📞 Support & Questions

Nếu có vấn đề hoặc câu hỏi:

1. Check Swagger documentation: `http://localhost:3000/api/docs`
2. Review API response errors
3. Contact Backend Team

---

## 🔄 Changelog

### Version 1.1.0 (2025-12-25)

- ✅ **New Matchmaking Flow**: Task selection dialog appears after match found
- ✅ **Task Display in Room**: Task info displayed in room screen (header/sidebar/floating options)
- ✅ **Progress Fields**: All task endpoints now return `progress` and `totalTimeSpent`
- ✅ **Improved Flow**: Matchmaking → Task Selection Dialog → Room Screen → Session Summary

### Version 1.0.0 (2025-12-25)

- ✅ Initial release
- ✅ Multi-session tracking
- ✅ Pause/Resume/Stop functionality
- ✅ Auto-complete when progress >= 100%
- ✅ Progress tracking with all sessions history

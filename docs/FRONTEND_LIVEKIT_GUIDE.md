# Frontend Integration Guide - LiveKit Video Call

Hướng dẫn chi tiết cách tích hợp LiveKit video call vào Frontend (Mobile + Web) sau khi backend match thành công.

## 📋 Mục Lục

1. [Tổng Quan](#tổng-quan)
2. [Mobile (Flutter)](#mobile-flutter)
3. [Web (React/Vue)](#web-reactvue)
4. [WebSocket Events](#websocket-events)
5. [Troubleshooting](#troubleshooting)

---

## Tổng Quan

### Flow Tổng Quát

```
1. User clicks "Join Matchmaking"
   ↓
2. Emit WebSocket event: join-matchmaking
   ↓
3. Backend tìm match
   ↓
4. Receive event: match_found (với livekitToken và livekitUrl)
   ↓
5. Connect to LiveKit room với token
   ↓
6. Enable camera/microphone
   ↓
7. Display video UI
   ↓
8. User can toggle camera/mic on/off
   ↓
9. User leaves → disconnect from LiveKit
```

### Backend Events

**Events từ Client → Server:**

- `join-matchmaking`: Tham gia matchmaking
- `cancel-matchmaking`: Hủy matchmaking
- `leave-room`: Rời khỏi room

**Events từ Server → Client:**

- `queue-joined`: Đã vào queue
- `match_found`: Tìm thấy match (có livekitToken, livekitUrl, roomId)
- `opponent_disconnected`: Opponent disconnect trong room
- `opponent_left`: Opponent rời room

---

## Mobile (Flutter)

### 1. Cài Đặt Dependencies

**pubspec.yaml:**

```yaml
dependencies:
  flutter:
    sdk: flutter

  # WebSocket
  socket_io_client: ^2.0.3+1

  # LiveKit
  livekit_client: ^2.0.0

  # Permissions
  permission_handler: ^11.0.1

  # UI
  flutter_webrtc: ^0.9.48
```

**Cài đặt:**

```bash
flutter pub get
```

### 2. Setup Permissions

**android/app/src/main/AndroidManifest.xml:**

```xml
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    <!-- Camera & Microphone Permissions -->
    <uses-permission android:name="android.permission.CAMERA" />
    <uses-permission android:name="android.permission.RECORD_AUDIO" />
    <uses-permission android:name="android.permission.MODIFY_AUDIO_SETTINGS" />
    <uses-permission android:name="android.permission.INTERNET" />

    <application>
        <!-- ... -->
    </application>
</manifest>
```

**ios/Runner/Info.plist:**

```xml
<dict>
    <!-- Camera Permission -->
    <key>NSCameraUsageDescription</key>
    <string>We need camera access for video calls</string>

    <!-- Microphone Permission -->
    <key>NSMicrophoneUsageDescription</key>
    <string>We need microphone access for voice calls</string>
</dict>
```

### 3. WebSocket Service

**lib/services/socket_service.dart:**

```dart
import 'package:socket_io_client/socket_io_client.dart' as IO;

class SocketService {
  static final SocketService _instance = SocketService._internal();
  factory SocketService() => _instance;
  SocketService._internal();

  IO.Socket? _socket;

  // Callbacks
  Function(Map<String, dynamic>)? onMatchFound;
  Function()? onQueueJoined;
  Function(String reason)? onRoomCancelled;

  void connect(String token) {
    _socket = IO.io(
      'http://localhost:3000', // Thay bằng API URL của bạn
      IO.OptionBuilder()
          .setTransports(['websocket'])
          .setAuth({'token': 'Bearer $token'})
          .enableAutoConnect()
          .build(),
    );

    _socket!.onConnect((_) {
      print('✅ Socket connected');
    });

    _socket!.onDisconnect((_) {
      print('❌ Socket disconnected');
    });

    // Listen to events
    _socket!.on('queue-joined', (data) {
      print('📝 Queue joined: $data');
      onQueueJoined?.call();
    });

    _socket!.on('match_found', (data) {
      print('🎉 Match found: $data');
      onMatchFound?.call(data as Map<String, dynamic>);
    });

    _socket!.on('opponent_disconnected', (data) {
      print('❌ Opponent disconnected: $data');
      onRoomCancelled?.call(data['message'] ?? 'Opponent disconnected');
    });

    _socket!.on('opponent_left', (data) {
      print('👋 Opponent left: $data');
      onRoomCancelled?.call(data['message'] ?? 'Opponent left the room');
    });

    _socket!.connect();
  }

  void joinMatchmaking({String? userName}) {
    _socket?.emit('join-matchmaking', {'userName': userName});
  }

  void cancelMatchmaking() {
    _socket?.emit('cancel-matchmaking');
  }

  void leaveRoom(String roomId) {
    _socket?.emit('leave-room', {'roomId': roomId});
  }

  void disconnect() {
    _socket?.disconnect();
    _socket?.dispose();
  }
}
```

### 4. LiveKit Service

**lib/services/livekit_service.dart:**

```dart
import 'package:livekit_client/livekit_client.dart';
import 'package:permission_handler/permission_handler.dart';

class LiveKitService {
  Room? _room;
  LocalParticipant? get localParticipant => _room?.localParticipant;

  // Callbacks
  Function(Participant participant)? onParticipantConnected;
  Function(Participant participant)? onParticipantDisconnected;
  Function(RoomState state)? onRoomStateChanged;

  Future<void> connect(String url, String token) async {
    // Request permissions
    await _requestPermissions();

    // Create room
    _room = Room();

    // Setup listeners
    _room!.addListener(_onRoomStateChanged);

    _room!.on<ParticipantConnectedEvent>((event) {
      print('👤 Participant connected: ${event.participant.identity}');
      onParticipantConnected?.call(event.participant);
    });

    _room!.on<ParticipantDisconnectedEvent>((event) {
      print('👋 Participant disconnected: ${event.participant.identity}');
      onParticipantDisconnected?.call(event.participant);
    });

    // Connect to room
    try {
      await _room!.connect(url, token);
      print('✅ Connected to LiveKit room');

      // Enable camera and microphone by default
      await _room!.localParticipant?.setCameraEnabled(true);
      await _room!.localParticipant?.setMicrophoneEnabled(true);
    } catch (e) {
      print('❌ Failed to connect to LiveKit: $e');
      rethrow;
    }
  }

  Future<void> _requestPermissions() async {
    await [
      Permission.camera,
      Permission.microphone,
    ].request();
  }

  void _onRoomStateChanged() {
    onRoomStateChanged?.call(_room!.connectionState);
  }

  Future<void> toggleCamera() async {
    final enabled = _room?.localParticipant?.isCameraEnabled() ?? false;
    await _room?.localParticipant?.setCameraEnabled(!enabled);
  }

  Future<void> toggleMicrophone() async {
    final enabled = _room?.localParticipant?.isMicrophoneEnabled() ?? false;
    await _room?.localParticipant?.setMicrophoneEnabled(!enabled);
  }

  Future<void> switchCamera() async {
    await _room?.localParticipant?.switchCamera();
  }

  Future<void> disconnect() async {
    await _room?.disconnect();
    await _room?.dispose();
    _room = null;
  }

  Room? get room => _room;
}
```

### 5. Video Call Screen

**lib/screens/video_call_screen.dart:**

```dart
import 'package:flutter/material.dart';
import 'package:livekit_client/livekit_client.dart';
import '../services/livekit_service.dart';
import '../services/socket_service.dart';

class VideoCallScreen extends StatefulWidget {
  final String livekitUrl;
  final String livekitToken;
  final String roomId;
  final String opponentName;

  const VideoCallScreen({
    Key? key,
    required this.livekitUrl,
    required this.livekitToken,
    required this.roomId,
    required this.opponentName,
  }) : super(key: key);

  @override
  State<VideoCallScreen> createState() => _VideoCallScreenState();
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  final LiveKitService _livekitService = LiveKitService();
  bool _isCameraEnabled = true;
  bool _isMicEnabled = true;
  Participant? _remoteParticipant;

  @override
  void initState() {
    super.initState();
    _connectToRoom();
  }

  Future<void> _connectToRoom() async {
    _livekitService.onParticipantConnected = (participant) {
      setState(() {
        _remoteParticipant = participant;
      });
    };

    _livekitService.onParticipantDisconnected = (participant) {
      setState(() {
        _remoteParticipant = null;
      });
    };

    try {
      await _livekitService.connect(widget.livekitUrl, widget.livekitToken);
    } catch (e) {
      _showError('Failed to connect: $e');
    }
  }

  void _showError(String message) {
    ScaffoldMessenger.of(context).showSnackBar(
      SnackBar(content: Text(message)),
    );
  }

  Future<void> _leaveRoom() async {
    await _livekitService.disconnect();
    SocketService().leaveRoom(widget.roomId);
    Navigator.of(context).pop();
  }

  @override
  void dispose() {
    _livekitService.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      backgroundColor: Colors.black,
      appBar: AppBar(
        title: Text('Video Call - ${widget.opponentName}'),
        backgroundColor: Colors.black87,
        actions: [
          IconButton(
            icon: const Icon(Icons.call_end, color: Colors.red),
            onPressed: _leaveRoom,
          ),
        ],
      ),
      body: Stack(
        children: [
          // Remote video (full screen)
          if (_remoteParticipant != null)
            _buildRemoteVideo()
          else
            _buildWaitingView(),

          // Local video (small preview)
          Positioned(
            top: 16,
            right: 16,
            child: _buildLocalVideo(),
          ),

          // Controls
          Positioned(
            bottom: 32,
            left: 0,
            right: 0,
            child: _buildControls(),
          ),
        ],
      ),
    );
  }

  Widget _buildRemoteVideo() {
    final videoTrack = _remoteParticipant!.videoTrackPublications
        .where((pub) => pub.subscribed && pub.track != null)
        .map((pub) => pub.track as VideoTrack)
        .firstOrNull;

    if (videoTrack == null) {
      return _buildWaitingView();
    }

    return VideoTrackRenderer(
      videoTrack,
      fit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
    );
  }

  Widget _buildLocalVideo() {
    final localVideoTrack = _livekitService.localParticipant?.videoTrackPublications
        .where((pub) => pub.track != null)
        .map((pub) => pub.track as VideoTrack)
        .firstOrNull;

    if (localVideoTrack == null) {
      return Container(
        width: 120,
        height: 160,
        decoration: BoxDecoration(
          color: Colors.grey[800],
          borderRadius: BorderRadius.circular(12),
        ),
        child: const Center(
          child: Icon(Icons.videocam_off, color: Colors.white, size: 40),
        ),
      );
    }

    return Container(
      width: 120,
      height: 160,
      decoration: BoxDecoration(
        borderRadius: BorderRadius.circular(12),
        border: Border.all(color: Colors.white, width: 2),
      ),
      clipBehavior: Clip.hardEdge,
      child: VideoTrackRenderer(
        localVideoTrack,
        fit: RTCVideoViewObjectFit.RTCVideoViewObjectFitCover,
        mirror: true,
      ),
    );
  }

  Widget _buildWaitingView() {
    return Container(
      color: Colors.grey[900],
      child: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            const CircularProgressIndicator(color: Colors.white),
            const SizedBox(height: 16),
            Text(
              'Waiting for ${widget.opponentName}...',
              style: const TextStyle(color: Colors.white, fontSize: 18),
            ),
          ],
        ),
      ),
    );
  }

  Widget _buildControls() {
    return Row(
      mainAxisAlignment: MainAxisAlignment.center,
      children: [
        // Toggle Camera
        _buildControlButton(
          icon: _isCameraEnabled ? Icons.videocam : Icons.videocam_off,
          onPressed: () async {
            await _livekitService.toggleCamera();
            setState(() {
              _isCameraEnabled = !_isCameraEnabled;
            });
          },
          color: _isCameraEnabled ? Colors.white : Colors.red,
        ),
        const SizedBox(width: 24),

        // Toggle Microphone
        _buildControlButton(
          icon: _isMicEnabled ? Icons.mic : Icons.mic_off,
          onPressed: () async {
            await _livekitService.toggleMicrophone();
            setState(() {
              _isMicEnabled = !_isMicEnabled;
            });
          },
          color: _isMicEnabled ? Colors.white : Colors.red,
        ),
        const SizedBox(width: 24),

        // Switch Camera
        _buildControlButton(
          icon: Icons.cameraswitch,
          onPressed: () async {
            await _livekitService.switchCamera();
          },
          color: Colors.white,
        ),
      ],
    );
  }

  Widget _buildControlButton({
    required IconData icon,
    required VoidCallback onPressed,
    required Color color,
  }) {
    return Container(
      decoration: BoxDecoration(
        color: Colors.black54,
        shape: BoxShape.circle,
      ),
      child: IconButton(
        icon: Icon(icon, color: color),
        iconSize: 32,
        onPressed: onPressed,
      ),
    );
  }
}
```

### 6. Matchmaking Screen

**lib/screens/matchmaking_screen.dart:**

```dart
import 'package:flutter/material.dart';
import '../services/socket_service.dart';
import 'video_call_screen.dart';

class MatchmakingScreen extends StatefulWidget {
  final String accessToken;
  final String userName;

  const MatchmakingScreen({
    Key? key,
    required this.accessToken,
    required this.userName,
  }) : super(key: key);

  @override
  State<MatchmakingScreen> createState() => _MatchmakingScreenState();
}

class _MatchmakingScreenState extends State<MatchmakingScreen> {
  final SocketService _socketService = SocketService();
  bool _isSearching = false;

  @override
  void initState() {
    super.initState();
    _setupSocketListeners();
    _socketService.connect(widget.accessToken);
  }

  void _setupSocketListeners() {
    _socketService.onQueueJoined = () {
      setState(() {
        _isSearching = true;
      });
    };

    _socketService.onMatchFound = (data) {
      setState(() {
        _isSearching = false;
      });

      // Navigate to video call screen
      Navigator.of(context).push(
        MaterialPageRoute(
          builder: (context) => VideoCallScreen(
            livekitUrl: data['livekitUrl'],
            livekitToken: data['livekitToken'],
            roomId: data['roomId'],
            opponentName: data['opponentName'] ?? 'Unknown',
          ),
        ),
      );
    };

    _socketService.onRoomCancelled = (reason) {
      setState(() {
        _isSearching = false;
      });

      ScaffoldMessenger.of(context).showSnackBar(
        SnackBar(content: Text('Room cancelled: $reason')),
      );
    };
  }

  void _startMatchmaking() {
    _socketService.joinMatchmaking(userName: widget.userName);
  }

  void _cancelMatchmaking() {
    _socketService.cancelMatchmaking();
    setState(() {
      _isSearching = false;
    });
  }

  @override
  void dispose() {
    _socketService.disconnect();
    super.dispose();
  }

  @override
  Widget build(BuildContext context) {
    return Scaffold(
      appBar: AppBar(
        title: const Text('Matchmaking'),
      ),
      body: Center(
        child: Column(
          mainAxisAlignment: MainAxisAlignment.center,
          children: [
            if (_isSearching) ...[
              const CircularProgressIndicator(),
              const SizedBox(height: 24),
              const Text(
                'Searching for opponent...',
                style: TextStyle(fontSize: 18),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _cancelMatchmaking,
                style: ElevatedButton.styleFrom(
                  backgroundColor: Colors.red,
                ),
                child: const Text('Cancel'),
              ),
            ] else ...[
              const Icon(Icons.videocam, size: 80, color: Colors.blue),
              const SizedBox(height: 24),
              const Text(
                'Ready to find a match?',
                style: TextStyle(fontSize: 18),
              ),
              const SizedBox(height: 24),
              ElevatedButton(
                onPressed: _startMatchmaking,
                style: ElevatedButton.styleFrom(
                  padding: const EdgeInsets.symmetric(
                    horizontal: 48,
                    vertical: 16,
                  ),
                ),
                child: const Text(
                  'Start Matchmaking',
                  style: TextStyle(fontSize: 18),
                ),
              ),
            ],
          ],
        ),
      ),
    );
  }
}
```

---

## Web (React/Vue)

### 1. Cài Đặt Dependencies (React)

```bash
npm install socket.io-client livekit-client
```

### 2. Socket Service (React)

**src/services/socketService.ts:**

```typescript
import { io, Socket } from 'socket.io-client';

class SocketService {
  private socket: Socket | null = null;

  // Callbacks
  public onMatchFound?: (data: MatchFoundData) => void;
  public onQueueJoined?: () => void;
  public onRoomCancelled?: (reason: string) => void;

  connect(token: string) {
    this.socket = io('http://localhost:3000', {
      transports: ['websocket'],
      auth: {
        token: `Bearer ${token}`,
      },
    });

    this.socket.on('connect', () => {
      console.log('✅ Socket connected');
    });

    this.socket.on('disconnect', () => {
      console.log('❌ Socket disconnected');
    });

    this.socket.on('queue-joined', (data) => {
      console.log('📝 Queue joined:', data);
      this.onQueueJoined?.();
    });

    this.socket.on('match_found', (data: MatchFoundData) => {
      console.log('🎉 Match found:', data);
      this.onMatchFound?.(data);
    });

    this.socket.on('opponent_disconnected', (data) => {
      console.log('❌ Opponent disconnected:', data);
      this.onRoomCancelled?.(data.message);
    });

    this.socket.on('opponent_left', (data) => {
      console.log('👋 Opponent left:', data);
      this.onRoomCancelled?.(data.message);
    });
  }

  joinMatchmaking(userName?: string) {
    this.socket?.emit('join-matchmaking', { userName });
  }

  cancelMatchmaking() {
    this.socket?.emit('cancel-matchmaking');
  }

  leaveRoom(roomId: string) {
    this.socket?.emit('leave-room', { roomId });
  }

  disconnect() {
    this.socket?.disconnect();
  }
}

export interface MatchFoundData {
  roomId: string;
  livekitToken: string;
  livekitUrl: string;
  opponentId: string;
  opponentName?: string;
}

export default new SocketService();
```

### 3. LiveKit Hook (React)

**src/hooks/useLiveKit.ts:**

```typescript
import { useEffect, useRef, useState } from 'react';
import {
  Room,
  RoomEvent,
  Track,
  RemoteParticipant,
  LocalParticipant,
  VideoTrack,
  AudioTrack,
} from 'livekit-client';

export function useLiveKit(url: string, token: string) {
  const [room] = useState(() => new Room());
  const [isConnected, setIsConnected] = useState(false);
  const [isCameraEnabled, setIsCameraEnabled] = useState(true);
  const [isMicEnabled, setIsMicEnabled] = useState(true);
  const [remoteParticipant, setRemoteParticipant] = useState<RemoteParticipant | null>(null);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  useEffect(() => {
    const connect = async () => {
      try {
        await room.connect(url, token);
        console.log('✅ Connected to LiveKit room');
        setIsConnected(true);

        // Enable camera and microphone
        await room.localParticipant.setCameraEnabled(true);
        await room.localParticipant.setMicrophoneEnabled(true);

        // Attach local video
        attachLocalVideo();
      } catch (error) {
        console.error('❌ Failed to connect to LiveKit:', error);
      }
    };

    // Setup event listeners
    room.on(RoomEvent.ParticipantConnected, (participant: RemoteParticipant) => {
      console.log('👤 Participant connected:', participant.identity);
      setRemoteParticipant(participant);
    });

    room.on(RoomEvent.ParticipantDisconnected, (participant: RemoteParticipant) => {
      console.log('👋 Participant disconnected:', participant.identity);
      setRemoteParticipant(null);
    });

    room.on(RoomEvent.TrackSubscribed, (track, publication, participant) => {
      if (track.kind === Track.Kind.Video) {
        attachRemoteVideo(track as VideoTrack);
      }
    });

    connect();

    return () => {
      room.disconnect();
    };
  }, [url, token]);

  const attachLocalVideo = () => {
    const videoTrack = room.localParticipant.videoTrackPublications.values().next().value?.track;
    if (videoTrack && localVideoRef.current) {
      videoTrack.attach(localVideoRef.current);
    }
  };

  const attachRemoteVideo = (track: VideoTrack) => {
    if (remoteVideoRef.current) {
      track.attach(remoteVideoRef.current);
    }
  };

  const toggleCamera = async () => {
    const enabled = !isCameraEnabled;
    await room.localParticipant.setCameraEnabled(enabled);
    setIsCameraEnabled(enabled);
  };

  const toggleMicrophone = async () => {
    const enabled = !isMicEnabled;
    await room.localParticipant.setMicrophoneEnabled(enabled);
    setIsMicEnabled(enabled);
  };

  const disconnect = async () => {
    await room.disconnect();
  };

  return {
    room,
    isConnected,
    isCameraEnabled,
    isMicEnabled,
    remoteParticipant,
    localVideoRef,
    remoteVideoRef,
    toggleCamera,
    toggleMicrophone,
    disconnect,
  };
}
```

### 4. Video Call Component (React)

**src/components/VideoCall.tsx:**

```typescript
import React from 'react';
import { useLiveKit } from '../hooks/useLiveKit';
import socketService from '../services/socketService';

interface VideoCallProps {
  livekitUrl: string;
  livekitToken: string;
  roomId: string;
  opponentName: string;
  onLeave: () => void;
}

export function VideoCall({
  livekitUrl,
  livekitToken,
  roomId,
  opponentName,
  onLeave,
}: VideoCallProps) {
  const {
    isConnected,
    isCameraEnabled,
    isMicEnabled,
    remoteParticipant,
    localVideoRef,
    remoteVideoRef,
    toggleCamera,
    toggleMicrophone,
    disconnect,
  } = useLiveKit(livekitUrl, livekitToken);

  const handleLeave = async () => {
    await disconnect();
    socketService.leaveRoom(roomId);
    onLeave();
  };

  return (
    <div className="video-call-container">
      {/* Remote Video (Full Screen) */}
      <div className="remote-video-container">
        {remoteParticipant ? (
          <video
            ref={remoteVideoRef}
            autoPlay
            playsInline
            className="remote-video"
          />
        ) : (
          <div className="waiting-view">
            <div className="spinner"></div>
            <p>Waiting for {opponentName}...</p>
          </div>
        )}
      </div>

      {/* Local Video (Small Preview) */}
      <div className="local-video-container">
        <video
          ref={localVideoRef}
          autoPlay
          playsInline
          muted
          className="local-video"
        />
      </div>

      {/* Controls */}
      <div className="controls">
        <button
          onClick={toggleCamera}
          className={`control-btn ${!isCameraEnabled ? 'disabled' : ''}`}
        >
          {isCameraEnabled ? '📹' : '🚫📹'}
        </button>

        <button
          onClick={toggleMicrophone}
          className={`control-btn ${!isMicEnabled ? 'disabled' : ''}`}
        >
          {isMicEnabled ? '🎤' : '🚫🎤'}
        </button>

        <button onClick={handleLeave} className="control-btn leave-btn">
          📞 End Call
        </button>
      </div>
    </div>
  );
}
```

**src/components/VideoCall.css:**

```css
.video-call-container {
  position: relative;
  width: 100vw;
  height: 100vh;
  background-color: #000;
}

.remote-video-container {
  width: 100%;
  height: 100%;
}

.remote-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
}

.waiting-view {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  height: 100%;
  color: white;
}

.spinner {
  border: 4px solid rgba(255, 255, 255, 0.3);
  border-top: 4px solid white;
  border-radius: 50%;
  width: 40px;
  height: 40px;
  animation: spin 1s linear infinite;
}

@keyframes spin {
  0% {
    transform: rotate(0deg);
  }
  100% {
    transform: rotate(360deg);
  }
}

.local-video-container {
  position: absolute;
  top: 16px;
  right: 16px;
  width: 120px;
  height: 160px;
  border: 2px solid white;
  border-radius: 12px;
  overflow: hidden;
}

.local-video {
  width: 100%;
  height: 100%;
  object-fit: cover;
  transform: scaleX(-1); /* Mirror effect */
}

.controls {
  position: absolute;
  bottom: 32px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 24px;
}

.control-btn {
  width: 60px;
  height: 60px;
  border-radius: 50%;
  border: none;
  background-color: rgba(0, 0, 0, 0.6);
  color: white;
  font-size: 24px;
  cursor: pointer;
  transition: background-color 0.3s;
}

.control-btn:hover {
  background-color: rgba(0, 0, 0, 0.8);
}

.control-btn.disabled {
  background-color: rgba(255, 0, 0, 0.6);
}

.leave-btn {
  background-color: rgba(255, 0, 0, 0.8);
}

.leave-btn:hover {
  background-color: rgba(255, 0, 0, 1);
}
```

---

## WebSocket Events

### Client → Server Events

#### 1. join-matchmaking

```typescript
socket.emit('join-matchmaking', {
  userName: 'John Doe', // Optional
});
```

#### 2. cancel-matchmaking

```typescript
socket.emit('cancel-matchmaking');
```

#### 3. leave-room

```typescript
socket.emit('leave-room', {
  roomId: 'room-uuid-123',
});
```

### Server → Client Events

#### 1. queue-joined

```typescript
socket.on('queue-joined', (data) => {
  console.log('Position in queue:', data.position);
});
```

**Response:**

```json
{
  "position": 1
}
```

#### 2. match_found

```typescript
socket.on('match_found', (data) => {
  const { roomId, livekitToken, livekitUrl, opponentId, opponentName } = data;
  // Connect to LiveKit with token
});
```

**Response:**

```json
{
  "roomId": "uuid-123",
  "livekitToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9...",
  "livekitUrl": "ws://localhost:7880",
  "opponentId": "user-456",
  "opponentName": "Jane Doe",
  "message": "Match found!"
}
```

#### 3. opponent_disconnected

```typescript
socket.on('opponent_disconnected', (data) => {
  console.log('Opponent disconnected:', data.message);
  // Navigate back to matchmaking or show error
});
```

**Response:**

```json
{
  "message": "Your opponent has disconnected",
  "roomId": "uuid-123"
}
```

#### 4. opponent_left

```typescript
socket.on('opponent_left', (data) => {
  console.log('Opponent left:', data.message);
  // Handle opponent leaving
});
```

**Response:**

```json
{
  "message": "Your opponent has left the room",
  "roomId": "uuid-123"
}
```

---

## Troubleshooting

### 1. Camera/Microphone Permission Denied

**Problem:** User denies camera/microphone permission

**Solution:**

```dart
// Flutter
Future<void> checkPermissions() async {
  final cameraStatus = await Permission.camera.status;
  final micStatus = await Permission.microphone.status;

  if (cameraStatus.isDenied || micStatus.isDenied) {
    // Show dialog to request permissions
    await showDialog(
      context: context,
      builder: (context) => AlertDialog(
        title: Text('Permissions Required'),
        content: Text('Camera and microphone access is required for video calls.'),
        actions: [
          TextButton(
            onPressed: () => openAppSettings(),
            child: Text('Open Settings'),
          ),
        ],
      ),
    );
  }
}
```

### 2. LiveKit Connection Failed

**Problem:** Cannot connect to LiveKit server

**Solutions:**

- Check if LiveKit server is running: `curl http://localhost:7880`
- Verify `livekitUrl` is correct (use `ws://` for local, `wss://` for production)
- Check token is valid and not expired
- Ensure firewall allows WebRTC ports (7880, 7881, 50000-60000)

### 3. Video Not Showing

**Problem:** Video track not rendering

**Solution:**

```typescript
// React
useEffect(() => {
  const videoTrack = participant.videoTrackPublications.values().next().value?.track;
  if (videoTrack && videoRef.current) {
    videoTrack.attach(videoRef.current);
  }

  return () => {
    videoTrack?.detach();
  };
}, [participant]);
```

### 4. Socket Disconnection

**Problem:** Socket disconnects unexpectedly

**Solution:**

```typescript
socket.on('disconnect', (reason) => {
  console.log('Disconnected:', reason);

  if (reason === 'io server disconnect') {
    // Server disconnected, try to reconnect
    socket.connect();
  }
});

socket.on('connect_error', (error) => {
  console.error('Connection error:', error);
  // Show error to user
});
```

### 5. Audio Echo

**Problem:** Hearing echo during call

**Solution:**

```dart
// Flutter - Ensure local video is muted
VideoTrackRenderer(
  localVideoTrack,
  muted: true, // Important!
)
```

```html
<!-- Web - Ensure local video is muted -->
<video ref="{localVideoRef}" autoplay playsinline muted />
```

---

## Production Checklist

- [ ] Use HTTPS/WSS in production (not HTTP/WS)
- [ ] Implement token refresh mechanism
- [ ] Add error boundaries and fallback UI
- [ ] Test on different devices and browsers
- [ ] Implement reconnection logic
- [ ] Add analytics/logging
- [ ] Test with poor network conditions
- [ ] Implement call quality indicators
- [ ] Add screen sharing (optional)
- [ ] Implement recording (optional)
- [ ] Test TURN server for NAT traversal
- [ ] Add call duration timer
- [ ] Implement graceful degradation

---

## Resources

- **LiveKit Client SDK (Flutter)**: https://docs.livekit.io/client-sdk-flutter/
- **LiveKit Client SDK (React)**: https://docs.livekit.io/client-sdk-js/
- **Socket.IO Client**: https://socket.io/docs/v4/client-api/
- **WebRTC Best Practices**: https://webrtc.org/getting-started/overview

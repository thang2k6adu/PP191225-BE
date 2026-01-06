# Frontend Integration Guide - LiveKit Video Call

Tài liệu này hướng dẫn chi tiết các bước Frontend cần thực hiện sau khi nhận được sự kiện ghép trận thành công (`match_found`) từ Backend.

## 📋 Mục Lục

1. [Quy Trình Xử Lý Sau Khi Ghép Trận](#quy-trình-xử-lý-sau-khi-ghép-trận)
2. [Chi Tiết Sự Kiện `match_found`](#chi-tiet-su-kien-match_found)
3. [Triển Khai Frontend (Mobile/Flutter)](#trien-khai-frontend-mobile-flutter)
4. [Triển Khai Frontend (Web/React)](#trien-khai-frontend-web-react)
5. [Lưu Ý Quan Trọng](#luu-y-quan-trong)

---

## Quy Trình Xử Lý Sau Khi Ghép Trận

Sau khi User đã vào hàng chờ bằng event `join-matchmaking`, Frontend cần lắng nghe sự kiện `match_found`. Khi sự kiện này bắn về, Frontend **BẮT BUỘC** thực hiện tuần tự các bước sau:

1.  **Nhận Data Match**: Lắng nghe event `match_found` và parse dữ liệu nhận được.
2.  **Kiểm Tra Data**: Đảm bảo `livekitToken` và `livekitUrl` không bị null/empty.
3.  **Điều Hướng UI**: Chuyển User sang màn hình `VideoCallScreen` (hoặc tương tự).
4.  **Kết Nối LiveKit**: Sử dụng LiveKit SDK để connect vào room ngay lập tức.
5.  **Bật Camera/Mic**: Mặc định bật camera và micro sau khi join thành công.
6.  **Hiển Thị Video**:
    - Render video của chính mình (Local Participant).
    - Render video của đối thủ (Remote Participant) ngay khi họ join hoặc publish track.

---

## Chi Tiết Sự Kiện `match_found`

**Event Name:** `match_found`

**Payload Data:**

```json
{
  "roomId": "match-uuid-123456",
  "opponentId": "user-uuid-789012",
  "opponentName": "Opponent Name",
  "livekitToken": "eyJhbGciOiJIUzI1NiIsInR5cCI6...",
  "livekitUrl": "ws://your-livekit-server:7880",
  "message": "Match found!"
}
```

> **Quan trọng:** Token này chỉ có hiệu lực trong một khoảng thời gian ngắn (thường là thời gian diễn ra trận đấu + buffer). Frontend cần dùng ngay để connect.

---

## Triển Khai Frontend (Mobile/Flutter)

### 1. Lắng nghe Event & Điều hướng

Trong `MatchmakingScreen` hoặc nơi quản lý socket của bạn:

```dart
// Trong hàm khởi tạo hoặc setup listeners
socket.on('match_found', (data) {
    print("🎯 Match Found: $data");

    String roomId = data['roomId'];
    String livekitToken = data['livekitToken'];
    String livekitUrl = data['livekitUrl'];
    String opponentName = data['opponentName'];

    if (livekitToken != null && livekitUrl != null) {
        // Stop loading / hiding waiting UI

        // Navigate to Video Call Screen
        Navigator.push(
          context,
          MaterialPageRoute(
            builder: (context) => VideoCallScreen(
              url: livekitUrl,
              token: livekitToken,
              roomName: roomId,
              opponentName: opponentName,
            ),
          ),
        );
    } else {
        print("❌ Error: Missing LiveKit data from server");
        // Handle error: show toast, go back, etc.
    }
});
```

### 2. Logic Màn Hình Video Call (`VideoCallScreen`)

Đây là nơi xử lý chính. Không cần gọi API nào thêm, chỉ dùng LiveKit SDK.

**Các bước cần làm trong `initState`:**

```dart
import 'package:livekit_client/livekit_client.dart';

class VideoCallScreen extends StatefulWidget {
  final String url;
  final String token;
  // ... check full example below
}

class _VideoCallScreenState extends State<VideoCallScreen> {
  Room? _room;
  EventsListener<RoomEvent>? _listener;

  @override
  void initState() {
    super.initState();
    // BƯỚC QUAN TRỌNG NHẤT: CONNECT
    _connectToRoom();
  }

  Future<void> _connectToRoom() async {
    // 1. Tạo options
    final roomOptions = RoomOptions(
      adaptiveStream: true,
      dynacast: true,
      defaultCameraCaptureOptions: const CameraCaptureOptions(
          width: 640, height: 480, maxFrameRate: 30),
    );

    // 2. Init Room
    _room = Room(roomOptions: roomOptions);

    // 3. Setup Listeners để update UI khi có thay đổi
    _listener = _room!.createListener();
    _setUpListeners();

    try {
      // 4. Connect
      // Quan trọng: dùng url và token nhận được từ 'match_found'
      await _room!.connect(widget.url, widget.token);

      // 5. Bật Mic & Cam
      await _room!.localParticipant?.setCameraEnabled(true);
      await _room!.localParticipant?.setMicrophoneEnabled(true);

    } catch (error) {
      print('Could not connect to LiveKit: $error');
    }
  }

  void _setUpListeners() {
    _listener!
      ..on<ParticipantConnectedEvent>((event) {
        print('Someone joined: ${event.participant.identity}');
        setState(() {}); // Update to show opponent status
      })
      ..on<ParticipantDisconnectedEvent>((event) {
        print('Someone left: ${event.participant.identity}');
         // Xử lý khi đối thủ thoát (hiện thông báo, end call...)
        setState(() {});
      })
      ..on<TrackSubscribedEvent>((event) {
        // Quan trọng: Khi nhận được video của đối thủ
        setState(() {});
      })
      ..on<TrackUnsubscribedEvent>((event) {
        // Khi đối thủ tắt cam
        setState(() {});
      });
  }

  // ... Build UI rendering VideoTrackRenderer for local and remote participant
}
```

### 3. Render Video

- **Local Video (Tôi):** Lấy từ `_room.localParticipant.videoTrackPublications`
- **Remote Video (Đối thủ):** Duyệt qua `_room.remoteParticipants`, lấy `videoTrackPublications`.

---

## Triển Khai Frontend (Web/React)

### 1. Lắng nghe Event & Điều hướng

```typescript
// Trong component Matchmaking
useEffect(() => {
  socket.on('match_found', (data) => {
    console.log('Match data:', data);

    // Save to state/context or pass via navigation
    const { livekitUrl, livekitToken, roomId, opponentName } = data;

    if (livekitUrl && livekitToken) {
      navigate(`/room/${roomId}`, { state: { livekitUrl, livekitToken, opponentName } });
    }
  });

  return () => {
    socket.off('match_found');
  };
}, []);
```

### 2. Logic Component Video Room

Sử dụng `livekit-react` (nếu có) hoặc `livekit-client` trực tiếp. Dưới đây là ví dụ dùng hook (khuyên dùng cho React).

```typescript
// npm install @livekit/components-react livekit-client

import {
  LiveKitRoom,
  VideoConference,
  GridLayout,
  ParticipantTile,
  useTracks,
} from '@livekit/components-react';
import { Track } from 'livekit-client';
import { useLocation } from 'react-router-dom';

export const VideoRoomPage = () => {
  // Lấy data từ navigation state
  const { state } = useLocation();
  const { livekitUrl, livekitToken } = state;

  if (!livekitToken) return <div>Missing Token</div>;

  return (
    <LiveKitRoom
      video={true}
      audio={true}
      token={livekitToken}
      serverUrl={livekitUrl}
      // Tự động connect khi component mount
      connect={true}
      data-lk-theme="default"
      style={{ height: '100vh' }}
    >
      {/* Giao diện mặc định của LiveKit - rất tiện lợi */}
      <VideoConference />

      {/* Hoặc Custom Layout */}
      {/* <MyCustomLayout /> */}
    </LiveKitRoom>
  );
};
```

Nếu muốn custom layout hoàn toàn:

```typescript
import { useTracks } from '@livekit/components-react';
import { Track } from 'livekit-client';

function MyCustomLayout() {
  // Lấy tất cả camera tracks đang có trong phòng
  const tracks = useTracks([Track.Source.Camera, Track.Source.Microphone]);

  return (
    <div className="grid-layout">
      {tracks.map((track) => (
        <ParticipantTile key={track.participant.identity} trackRef={track} />
      ))}
    </div>
  );
}
```

---

## Lưu Ý Quan Trọng

1.  **Xử Lý Disconnect**:
    - Khi user bấm nút "End Call" hoặc "Leave", BẮT BUỘC phải gọi `room.disconnect()` để giải phóng tài nguyên.
    - Lắng nghe sự kiện `opponent_disconnected` từ socket (backend cũng bắn event này) để hiển thị thông báo "Đối thủ đã thoát".

2.  **Permissions**:
    - Trên Mobile (iOS/Android), phải xin quyền Camera và Microphone **TRƯỚC** khi connect vào LiveKit. Nếu không sẽ bị lỗi permission denied.

3.  **UI Waiting**:
    - Có thể user A vào phòng nhanh hơn user B. Lúc này `remoteParticipants` sẽ rỗng.
    - User A sẽ thấy mình.
    - Cần hiển thị trạng thái "Waiting for opponent..." cho đến khi nhận event `ParticipantConnected`.

4.  **Testing**:
    - Mở 2 trình duyệt (hoặc 1 mobile, 1 web) login 2 user khác nhau.
    - Cùng bấm Find Match.
    - Quan sát console log `match_found`.
    - Kiểm tra cả 2 bên đều hiện video của nhau.

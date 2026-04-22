# Module Rooms — Tài liệu & Giải thích logic dịch vụ

Cập nhật: 2026-04-21

## 1) Tổng quan

Tài liệu này mô tả module `rooms`: cấu trúc database, các ràng buộc, hợp đồng API, logic nghiệp vụ ở tầng service và cách các yêu cầu ánh xạ vào triển khai trong [src/modules/rooms/rooms.service.ts](src/modules/rooms/rooms.service.ts). Tài liệu dành cho kỹ sư backend và người duyệt mã.

## 2) Mối quan hệ dữ liệu (ER)

- `users` (1) — (n) `room_members`
- `rooms` (1) — (n) `room_members`

Quy tắc:

- Một user có thể có nhiều bản ghi `room_member` theo thời gian.
- Một room có thể có nhiều `room_member`.
- Một `room_member` thuộc đúng một `user` và một `room`.
- Mỗi cặp (`roomId`, `userId`) là duy nhất trong `room_members`.

## 3) Bảng dữ liệu (tóm tắt & ràng buộc)

Bảng `rooms`

- `id`: String PK (uuid)
- `type`: enum `RoomType` (`PUBLIC | MATCH`), mặc định `PUBLIC`
- `topic`: String, nullable, bắt buộc cho phòng `PUBLIC`
- `visibility`: enum `RoomVisibility` (`PUBLIC | PRIVATE`), mặc định `PUBLIC`
- `status`: enum `RoomStatus` (`WAITING | ACTIVE | CLOSED`), mặc định `WAITING`
- `maxMembers`: Int, mặc định `2`
- `createdAt`, `updatedAt`
- `endedAt`: DateTime, nullable
- `livekitRoomName`: String, unique, nullable
- `startedAt`: DateTime, nullable

Bảng `room_members`

- `id`: String PK (uuid)
- `roomId`: FK -> `rooms.id`, `ON DELETE CASCADE`
- `userId`: FK -> `users.id`, `ON DELETE CASCADE`
- `status`: enum `RoomMemberStatus` (`JOINED | READY | LEFT`), mặc định `JOINED`
- `joinedAt`: DateTime, mặc định `now()`
- `leftAt`: DateTime, nullable
- `readyAt`: DateTime, nullable
- UNIQUE constraint trên (`roomId`, `userId`)
- Index trên `roomId`, `userId`

Ràng buộc chính:

- Room `PUBLIC` thường có `topic` và `livekitRoomName`.
- Room `MATCH` có `visibility = PRIVATE` và `maxMembers` bằng số người tham gia.
- Xóa `room` hoặc `user` sẽ cascade xóa `room_members` liên quan.

## 4) API (tóm tắt các route)

| Method | Endpoint                 | Auth | Mục đích                                |
| ------ | ------------------------ | ---- | --------------------------------------- |
| GET    | /api/rooms/current       | JWT  | Lấy room active hiện tại của user       |
| GET    | /api/rooms/public        | JWT  | Lấy danh sách public room có phân trang |
| POST   | /api/rooms/:roomId/join  | JWT  | Vào public room và nhận token LiveKit   |
| GET    | /api/rooms/:roomId       | JWT  | Lấy thông tin room và members           |
| POST   | /api/rooms/:roomId/leave | JWT  | Rời room                                |

Tất cả response tuân theo wrapper success/error chung của dự án.

## 5) Logic nghiệp vụ ở tầng service (tổng quan)

- Xác thực: tất cả endpoint của `rooms` yêu cầu JWT; controller chuyển `user.id` vào service.
- Đếm thành viên: `currentMembers` không tính những `room_member` có `status = LEFT`.
- Đồng thời (concurrency): hiện tại chưa bọc transaction Prisma cho các luồng nhiều bước.
- Room `current` chỉ trả về active room của user nếu còn membership hợp lệ và room chưa `CLOSED`.

## 6) Ánh xạ: các hàm trong service và giải thích

`RoomsService` chứa các hàm chính. Mô tả dưới đây giải thích mục đích, các bước kiểm tra và kết quả trả về.

### `findExistingActiveMember(userId: string)`

- Mục đích: Kiểm tra `userId` hiện có membership active nào trong phòng không.
- Hành vi:
  - Truy vấn `room_member` với điều kiện `userId` khớp, `status != LEFT` và phòng liên kết `room.status != CLOSED`.
  - Kèm theo dữ liệu `room` để kiểm tra trạng thái và kiểu phòng.
- Trả về: bản ghi `room_member` hoặc `null`.

### `generateRoomName(type: RoomType, topic?: string): string`

- Mục đích: Tạo `livekitRoomName` theo kiểu phòng.
- Hành vi:
  - Với `PUBLIC` yêu cầu `topic` và trả về dạng `public-${topic}`.
  - Với `MATCH` trả về `match-${uuid()}`.
  - Ném `BadRequestException` nếu thiếu dữ liệu bắt buộc.

### `getPublicRooms(query: QueryRoomsDto)`

- Mục đích: Trả danh sách public rooms có phân trang kèm số `currentMembers`.
- Hành vi:
  - Lọc `rooms` theo `type = PUBLIC` và `visibility = PUBLIC`.
  - Dùng `_count.members` với điều kiện loại trừ thành viên `LEFT` để tính `currentMembers`.
  - Map các trường trả về theo hợp đồng API: `id`, `type`, `topic`, `livekitRoomName`, `status`, `maxMembers`, `currentMembers`.
  - Trả kết quả đã phân trang.

### `getCurrentActiveRoom(userId: string)`

- Mục đích: Trả về room active hiện tại của user và cấp lại token LiveKit nếu cần.
- Hành vi:
  - Gọi `findExistingActiveMember(userId)`.
  - Nếu không có membership hợp lệ hoặc room đã `CLOSED`, trả `{ hasActiveRoom: false, room: null, token: null }`.
  - Nếu có, sinh token LiveKit bằng `livekitService.generateToken(existingMember.room.livekitRoomName, userId)`.
  - Trả `{ hasActiveRoom: true, room: {...}, token }`.

### `findOrCreatePublicRoom(topic: string, userId: string)`

- Mục đích: Tham gia room `PUBLIC` theo `topic` hoặc tạo mới nếu không có; trả token LiveKit.
- Các bước/kiểm tra:
  1. Gọi `findExistingActiveMember(userId)`; nếu user đã ở room active thì cấp token cho room đó và dừng.
  2. Tìm `availableRoom` `PUBLIC` cùng `topic`, `visibility = PUBLIC`, `status = ACTIVE` và số thành viên hiện tại < `maxMembers`.
  3. Nếu có `availableRoom`:
     - Nếu tồn tại `room_member` cho cặp (`roomId`, `userId`) thì update về `JOINED` và xóa `leftAt`.
     - Ngược lại tạo mới `room_member` với `status = JOINED`.
  4. Nếu không có room phù hợp, tạo room `PUBLIC` mới với `livekitRoomName` từ `generateRoomName`, `maxMembers = 10`, `status = ACTIVE` và tạo `room_member` cho user.
  5. Update `user.status` => `IN_ROOM`.
  6. Sinh token LiveKit bằng `livekitService.generateToken(room.livekitRoomName, userId)`.
  7. Trả `{ roomId, livekitRoomName, token, topic, isNewRoom }`.

Ghi chú: phương thức này vừa tạo room vừa thay đổi membership; hiện chưa dùng transaction. Nếu gặp race condition nên cân nhắc bọc các bước tạo room + tạo/update member + update user trong transaction.

### `joinPublicRoom(roomId: string, userId: string)`

- Mục đích: Cho user vào room public hiện có và trả token LiveKit.
- Các bước/kiểm tra:
  1. Nếu `findExistingActiveMember(userId)` trả về member cùng `roomId` thì cấp lại token và trả thông tin room.
  2. Nếu user đang ở room active khác thì ném `ConflictException('User already in a room')`.
  3. Tải `room` mục tiêu kèm danh sách members chưa `LEFT`.
  4. Nếu không tìm thấy room thì `NotFoundException`.
  5. Nếu `room.type !== PUBLIC` thì `ForbiddenException`.
  6. Nếu `room.status !== ACTIVE` thì `ConflictException`.
  7. Nếu `room.members.length >= room.maxMembers` thì `ConflictException` (phòng đầy).
  8. Nếu đã tồn tại `room_member` cho (`roomId`, `userId`) thì update về `JOINED` và xóa `leftAt`, ngược lại tạo mới với `JOINED`.
  9. Update `user.status` => `IN_ROOM`.
  10. Sinh token LiveKit và trả `{ roomId, livekitRoomName, token, topic }`.

### `createMatchRoom(userIds: string[], topic?: string)`

- Mục đích: Tạo match room riêng cho tập user và trả token cho từng người.
- Hành vi:
  - Tạo `livekitRoomName` bằng `generateRoomName(RoomType.MATCH, topic)`.
  - Tạo `room` với `visibility = PRIVATE`, `status = ACTIVE`, `maxMembers = userIds.length`, set `startedAt`, và tạo `room_members` cho từng user (`JOINED`).
  - Cập nhật trạng thái các user thành `IN_ROOM` bằng `updateMany`.
  - Sinh token LiveKit cho từng user và trả kèm thông tin members.

### `joinMatchmaking(userId: string)`

- Mục đích: Flow ghép đôi (matchmaking) dùng public waiting rooms.
- Hành vi:
  - Nếu user đã có membership active thì ném `ConflictException`.
  - Tìm room có `type = PUBLIC` và `status = WAITING`, có members chưa `LEFT`, và `members.length < maxMembers`.
  - Nếu tìm thấy: tạo `room_member` cho user, đếm lại members và nếu đủ `maxMembers` thì chuyển `room.status` sang `ACTIVE`.
  - Nếu không tìm thấy: tạo room mới `WAITING` với `maxMembers = 2` và tạo member đầu tiên.
  - Update `user.status` => `IN_ROOM`.
  - Trả thông tin tóm tắt room và members.

### `findOne(roomId: string, userId: string)`

- Mục đích: Trả chi tiết room và danh sách members nếu người gọi là member.
- Hành vi:
  - Query `room` kèm members có `status != LEFT` và include thông tin `user`.
  - Nếu không tìm thấy room thì `NotFoundException`.
  - Nếu `userId` không nằm trong danh sách members thì `ForbiddenException`.
  - Trả metadata room và members theo hợp đồng API.

### `leave(roomId: string, userId: string)`

- Mục đích: User rời room, cập nhật trạng thái và đóng MATCH room khi cần.
- Hành vi & các bước:
  1. Tải `room` kèm tất cả `members` để xác định bản ghi member.
  2. Nếu không tìm thấy room thì `NotFoundException`.
  3. Nếu không có member cho `userId`, cập nhật `user.status` => `ONLINE` và trả thành công.
  4. Nếu `member.status === LEFT`, cập nhật `user.status` => `ONLINE` và trả thành công.
  5. Ngược lại cập nhật `room_member` về `status = LEFT`, `leftAt = now()`.
  6. Đếm số thành viên còn lại có `status != LEFT`.
  7. Nếu `room.type === MATCH` và `remainingMembers <= 1`:
     - Nếu `room.livekitRoomName` tồn tại, gọi `livekitService.deleteRoom` để xóa phòng LiveKit.
     - Cập nhật `room.status = CLOSED` và set `endedAt`.
  8. Cập nhật `user.status` => `ONLINE`.
  9. Trả thông báo thành công.

Ghi chú: khi đóng MATCH room có gọi dịch vụ LiveKit; hiện implementation log lỗi nhưng vẫn tiếp tục cập nhật DB.

## 7) Quy tắc validate (tầng application)

- Vào public room qua `joinPublicRoom` phải thỏa: room tồn tại, là `PUBLIC`, đang `ACTIVE`, chưa đầy, và user không đang ở room active khác.
- `findOne` bắt buộc người gọi phải là thành viên của room.
- `leave` xử lý trường hợp không phải thành viên bằng cách vẫn cập nhật `user.status` về `ONLINE`.

Validate ở hệ thống:

- Tất cả endpoint `rooms` yêu cầu JWT.
- Path param sai sẽ trả 400 do pipeline chung.

## 8) Ghi chú về transaction & đồng thời

- Hiện service chưa bọc các luồng nhiều bước (tạo/update member + update user status) trong transaction Prisma.
- Các thao tác nên cân nhắc bọc transaction khi tải cao:
  - Join hoặc create public room có thể gặp race condition làm overfill room.
  - createMatchRoom cùng `updateMany` user có thể để lại trạng thái không nhất quán khi xảy ra lỗi từng phần.
- Khuyến nghị: thêm Prisma `transaction` hoặc `interactiveTransactions` cho các chuỗi bước quan trọng nếu gặp vấn đề khi stress test.

## 9) Hợp đồng API & ví dụ

Tham khảo wrapper response toàn cục của dự án. Ví dụ payload thành công tương ứng với các phương thức dịch vụ như đã mô tả.

Ví dụ (rút gọn):

- GET /api/rooms/current -> trả `{ hasActiveRoom, room, token }` khi user còn active room.
- GET /api/rooms/public -> trả danh sách public rooms kèm `currentMembers` (không tính member có `status = LEFT`).
- POST /api/rooms/:roomId/join -> trả `{ roomId, livekitRoomName, token, topic }` khi thành công.
- POST /api/rooms/:roomId/leave -> trả `{ message: 'Left room successfully' }`.

## 10) Test case (tóm tắt)

- Get current room: trả `hasActiveRoom = true` khi user còn membership active; trả `false` nếu không có room hợp lệ hoặc room đã `CLOSED`.
- Get public rooms: chỉ trả room `PUBLIC` có `visibility = PUBLIC` và `currentMembers` đúng.
- Join public room: thành công; 404 nếu room không tồn tại; 403 nếu room không phải PUBLIC; 409 nếu room không ACTIVE; 409 nếu full; 409 nếu user đang ở room khác; nếu user đã ở đúng room thì trả token lại.
- Get room by id: 404 nếu không tìm thấy; 403 nếu user không phải member.
- Leave room: 404 nếu room không tồn tại; nếu user không phải member vẫn trả thành công và set user về ONLINE; nếu member đã LEFT vẫn trả thành công; nếu MATCH room còn <= 1 member thì room bị CLOSED và LiveKit room bị xóa.

## 11) Liên kết tới mã nguồn

Service nằm ở: [src/modules/rooms/rooms.service.ts](src/modules/rooms/rooms.service.ts). Các phương thức chính trong file này tương ứng với mô tả ở trên.

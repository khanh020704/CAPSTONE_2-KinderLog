# KinderLog — Cơ sở dữ liệu SQL Server

Backend (`BE/`) lưu dữ liệu trong **SQL Server**. Điểm xuất phát là bản sao lưu của trường, `BackUp/C2SE10_KinderLog_new.bak`. Các migration trong `BE/src/migrations` thêm những bảng và cột mà API cần. Code chỉ truy cập DB qua **Unit of Work** (`BE/src/db/unit-of-work.js`).

## 1. Cài đặt trên máy mới

1. Cài SQL Server 2022 Express và **ODBC Driver 17 for SQL Server**.
2. Restore file `.bak` thành database `KinderLog`, bằng SSMS (Restore Database) hoặc lệnh:

   ```sql
   RESTORE DATABASE [KinderLog] FROM DISK = N'...\BackUp\C2SE10_KinderLog_new.bak'
   WITH MOVE 'C2SE10_KinderLog_new' TO N'<thư mục DATA>\KinderLog.mdf',
        MOVE 'C2SE10_KinderLog_new_log' TO N'<thư mục DATA>\KinderLog_log.ldf'
   ```

   Bỏ qua bước này nếu muốn một DB trống: `npm run migrate` tự tạo `KinderLog` và dựng đủ cấu trúc gốc.
3. Trong `BE/.env`:

   ```
   DB_SERVER=(local)\SQLEXPRESS
   DB_NAME=KinderLog
   ```

   Mặc định đăng nhập bằng tài khoản Windows, không cần mật khẩu. Muốn dùng tài khoản SQL Server (qua TCP) thì thêm `DB_USER`, `DB_PASSWORD`, và `DB_PORT` (mặc định 1433).
4. Trong `BE/`:

   ```
   npm install
   npm run migrate
   npm run create-admin -- admin <mật khẩu> --reset-password
   npm run dev
   python ../Debug/seed_teacher.py --admin-password <mật khẩu>
   ```

   Mọi tài khoản trong file `.bak` đều có mật khẩu giả (`$2a$10$hashA…`), nên không ai đăng nhập được. Lệnh `--reset-password` đặt mật khẩu thật cho `admin`. `seed_teacher.py` tạo lớp "Mặt Trời 1": giáo viên `0903000001`, phụ huynh `0904000001`–`06`, cùng mật khẩu `123456`.

## 2. Migration

| File | Nội dung |
| --- | --- |
| `001-baseline.js` | Đúng cấu trúc của file `.bak`: 13 bảng, 2 view (`vw_ClassJournalProgress`, `vw_ParentJournalView`), 2 procedure (`sp_GetClassJournalsByDate`, `sp_BulkCreateJournals`), 3 trigger. Trên DB đã restore thì không làm gì. |
| `002-accounts-and-messages.js` | `Users.IsLocked`; số điện thoại và email chỉ phải duy nhất khi có giá trị; `Students.PhotoUrl`; `Parent_Student_Map.IsActive`; `Attendance.UpdatedAt`; `Audit_Logs.Status`; `Notifications.SummaryID` cùng hai loại thông báo `MESSAGE`, `ANNOUNCEMENT`. Thêm bảng `Messages`, `System_Settings`, `Refresh_Tokens`, `Password_Reset_Tokens`. Giờ mặc định và trigger `UpdatedAt` chuyển sang UTC. |
| `003-class-journal.js` | Nhật ký lớp: `Class_Daily_Summaries` có thêm `Status`, `InputMethod`, `RawTranscript`, `GeneralNote`, `ApprovedAt`, `PublishedAt`, và các mục tăng lên 2000 ký tự. Thêm bảng `Summary_Personal_Notes` (ghi chú riêng từng bé), `Summary_Audio` (bản ghi âm), `Summary_Review_Issues` (điểm giáo viên cần xác nhận). |
| `004-published-version.js` | Bản phụ huynh đang thấy, tách khỏi bản giáo viên đang sửa: `Summary_Published`, `Summary_Published_Notes`, `Summary_Published_Photos`, cùng cột `Revision`. Nhật ký đã xuất bản từ trước được chép thành bản 1. |
| `005-attendance-check.js` | Loại điểm cần xác nhận mới `attendance_mismatch`: ghi âm nói về bé đã điểm danh vắng ("bé An ăn hết suất"), hoặc bé có mặt mà câu nói bé nghỉ. |
| `006-read-committed-snapshot.js` | Bật `READ_COMMITTED_SNAPSHOT`: lệnh đọc (ví dụ cổng phụ huynh hỏi lại mỗi 10 giây) không phải chờ transaction đang ghi, nên không còn timeout khi giáo viên đang lưu. Transaction ghi vẫn khóa nhau như cũ. |
| `007-corrections.js` | Đính chính giữa hai lần ghi âm ("Cô nhầm, bé An ăn hết suất"): loại điểm cần xác nhận mới `correction`, cách xử lý mới `reverted` (giữ lại cả câu cũ), cột `Summary_Review_Issues.PreviousText` lưu câu đã bị thay. Câu cũ, câu mới, thời điểm và cách giáo viên xử lý đều còn lại để tra cứu. |

Các lệnh: `npm run migrate` (chạy hết), `npm run migrate:down` (gỡ migration gần nhất), `npm run migrate:status`. Migration nào đã chạy được ghi vào bảng `Schema_Migrations`.

ID trong API là số thứ tự dòng (`INT IDENTITY`), gửi dưới dạng chuỗi, ví dụ `"12"`.

## 3. Unit of Work

Service không gọi bảng trực tiếp. Mọi truy cập đi qua một unit, và unit đó có một repository cho mỗi bảng:

```js
import { UnitOfWork } from '../../db/unit-of-work.js'

// Ghi: một transaction. Hàm trả về bình thường thì lưu tất cả; ném lỗi thì không lưu gì.
const journal = await UnitOfWork.run(async (uow) => {
  const saved = await uow.journals.save(draft)
  await uow.journalPhotos.insert({ summaryId: saved.id, classId, photoUrl })
  return saved
})

// Đọc: không cần transaction.
const students = await UnitOfWork.read().students.find({ classId, isActive: true })
```

| Repository | Bảng |
| --- | --- |
| `users`, `schools`, `classes`, `students`, `parentLinks`, `attendance` | Bảng gốc của trường |
| `journals` | Nhật ký lớp **trọn vẹn**: hàng `Class_Daily_Summaries` cùng ghi chú, ghi âm, điểm cần xác nhận và bản đã xuất bản. Chỉ ghi được bên trong `UnitOfWork.run` |
| `summaries`, `dailyJournals`, `feedbacks`, `journalPhotos`, `notifications`, `aiLogs`, `auditLogs` | Từng bảng riêng lẻ |
| `messages` | Tin nhắn, có thêm hàm tóm tắt từng cuộc trò chuyện |
| `refreshTokens`, `resetTokens`, `settings` | Phiên đăng nhập, link đặt lại mật khẩu, cài đặt hệ thống |

Mỗi repository bảng có: `find`, `findOne`, `findById`, `count`, `exists`, `insert`, `update`, `updateById`, `remove`, `removeById`. Điều kiện viết dạng `{ classId, status: { $in: [...] }, revision: { $gt: 0 } }`. Mọi giá trị đều được truyền dưới dạng tham số SQL, không ghép thẳng vào câu lệnh.

Những việc đang chạy trong một transaction: lưu nhật ký (nội dung, quyết định, ảnh), duyệt, xuất bản, ghi âm thêm, lưu cả bảng điểm danh, đổi hoặc đặt lại mật khẩu (kèm kết thúc các phiên khác), đăng nhập (giờ đăng nhập cùng phiên mới), làm mới token, sửa hồ sơ, lưu cài đặt, gửi và đánh dấu đã đọc tin nhắn. Thông báo, audit log và log AI ghi trong unit riêng: chúng lỗi thì không làm hỏng việc chính.

## 4. Kiểm thử

`python Debug/debug_api.py` tạo DB tạm `kinderlog_debug`, chạy migration và 319 check qua API, trong đó nhóm `database` kiểm tra Unit of Work (lưu, hủy, chặn ghi nhật ký ngoài transaction). Xong thì xóa DB tạm. DB thật không bị động tới.

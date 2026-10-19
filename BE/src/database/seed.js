require('dotenv').config();
const bcrypt = require('bcryptjs');
const { getPool, sql } = require('./db');

const now = Date.now();
const ago = (minutes) => now - minutes * 60000;

async function seed() {
  try {
    console.log('🌱 Seeding database...');
    const pool = await getPool();
    const req = () => pool.request();

    // ── 1. Clear all tables (in FK-safe order) ──────────────────────
    const tables = [
      'AuditLogs', 'SystemSettings', 'NotificationReads', 'Notifications',
      'Announcements', 'Messages', 'Journals', 'Attendance',
      'CameraSchedules', 'Cameras', 'ParentStudentLinks',
      'Parents', 'Students', 'Classes', 'Teachers',
      'AcademicYears', 'Principals', 'Schools', 'Admins',
    ];
    for (const t of tables) {
      await req().query(`DELETE FROM [${t}]`);
    }
    console.log('   🗑️  Cleared existing data.');

    const hash = (pw) => bcrypt.hashSync(pw, 10);
    const DEFAULT_PW = hash('123456');

    // ── 2. Admins ────────────────────────────────────────────────────
    await req().query(`
      INSERT INTO Admins (Id, Name, Phone, Email, PasswordHash, Status, LastLogin, CreatedAt)
      VALUES ('a1', N'Lê Quang Huy', '0901000001', 'huy.le@kinderlog.vn', '${DEFAULT_PW}', 'Active', ${ago(90)}, ${ago(60 * 24 * 150)})
    `);

    // ── 3. Schools ───────────────────────────────────────────────────
    await req().query(`
      INSERT INTO Schools (Id, Name, Address, Phone, Email, PrincipalId, Status, CreatedAt)
      VALUES ('s1', N'Mầm non Kinder Stars', N'25 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
              '02363888999', 'lienhe@kinderstars.edu.vn', 'pr1', 'Active', ${ago(60 * 24 * 120)})
    `);

    // ── 4. Principals ────────────────────────────────────────────────
    await req().query(`
      INSERT INTO Principals (Id, Name, Phone, Email, PasswordHash, SchoolId, Status, CreatedAt, LastLogin)
      VALUES ('pr1', N'Trần Thị Lan', '0902000001', 'lan.tran@kinderstars.edu.vn',
              '${DEFAULT_PW}', 's1', 'Active', ${ago(60 * 24 * 118)}, ${ago(35)})
    `);

    // ── 5. Academic Years ────────────────────────────────────────────
    await req().query(`
      INSERT INTO AcademicYears (Id, Name, StartDate, EndDate, Status, SchoolId)
      VALUES
        ('y1', N'2025–2026', '2025-09-05', '2026-05-31', 'Archived', 's1'),
        ('y2', N'2026–2027', '2026-09-05', '2027-05-31', 'Current',  's1')
    `);

    // ── 6. Teachers ──────────────────────────────────────────────────
    const teachers = [
      ['t1', 'Nguyễn Thị Mai', '0903000001', 'mai.nguyen@kinderstars.edu.vn', 'Active', ago(60 * 24 * 100), ago(20)],
      ['t2', 'Phạm Thu Hà',    '0903000002', 'ha.pham@kinderstars.edu.vn',    'Active', ago(60 * 24 * 98),  ago(55)],
      ['t3', 'Lê Thị Ngọc Ánh','0903000003', 'anh.le@kinderstars.edu.vn',    'Active', ago(60 * 24 * 60),  ago(60 * 26)],
      ['t4', 'Đỗ Thị Thanh Vân','0903000004', 'van.do@kinderstars.edu.vn',   'Inactive',ago(60*24*90),     ago(60*24*21)],
    ];
    for (const [id, name, phone, email, status, createdAt, lastLogin] of teachers) {
      await req().query(`
        INSERT INTO Teachers (Id, Name, Phone, Email, PasswordHash, SchoolId, Status, CreatedAt, LastLogin)
        VALUES ('${id}', N'${name}', '${phone}', '${email}', '${DEFAULT_PW}', 's1', '${status}', ${createdAt}, ${lastLogin})
      `);
    }

    // ── 7. Classes ───────────────────────────────────────────────────
    await req().query(`
      INSERT INTO Classes (Id, Name, YearId, TeacherId, SchoolId, Status)
      VALUES
        ('c1', N'Mặt Trời 1', 'y2', 't1', 's1', 'Active'),
        ('c2', N'Mặt Trời 2', 'y2', 't2', 's1', 'Active')
    `);

    // ── 8. Students & Parents ────────────────────────────────────────
    const studentsData = [
      // classId, name, dob, gender, parentName, phone, relationship
      ['c1','Nguyễn Minh An',    '2022-03-14','Male',  'Nguyễn Thị Hương',    '0904000001','Mother'],
      ['c1','Trần Bảo Ngọc',     '2022-01-22','Female','Trần Văn Dũng',        '0904000002','Father'],
      ['c1','Lê Gia Huy',        '2021-11-05','Male',  'Phạm Thị Thu',         '0904000003','Mother'],
      ['c1','Phạm Khánh Linh',   '2022-05-30','Female','Phạm Quốc Tuấn',       '0904000004','Father'],
      ['c1','Hoàng Đức Minh',    '2021-12-18','Male',  'Vũ Thị Hạnh',          '0904000005','Mother'],
      ['c1','Vũ Ngọc Diệp',      '2022-02-09','Female','Vũ Minh Khôi',         '0904000006','Father'],
      ['c1','Đặng Tuấn Kiệt',    '2022-07-21','Male',  'Đặng Thị Lan Anh',     '0904000007','Mother'],
      ['c1','Bùi Thảo Vy',       '2022-04-02','Female','Bùi Văn Long',          '0904000008','Father'],
      ['c1','Đỗ Nhật Nam',       '2021-10-27','Male',  'Lý Thị Kim Oanh',      '0904000009','Mother'],
      ['c1','Ngô Hà My',         '2022-06-15','Female','Ngô Thanh Tùng',        '0904000010','Father'],
      ['c1','Dương Quang Khải',  '2022-08-08','Male',  'Dương Thị Mỹ Duyên',   '0904000011','Mother'],
      ['c1','Lý An Nhiên',       '2022-03-03','Female','Lý Hoàng Nam',          '0904000012','Father'],
      ['c1','Trịnh Bảo Long',    '2021-09-19','Male',  'Trịnh Thị Phương',     '0904000013','Mother'],
      ['c1','Mai Tuệ Lâm',       '2022-01-11','Female','Mai Văn Sơn',           '0904000014','Father'],
      ['c1','Phan Gia Bảo',      '2022-05-07','Male',  'Phan Thị Yến',         '0904000015','Mother'],
      ['c1','Hồ Khả Hân',        '2022-02-25','Female','Hồ Sỹ Hùng',           '0904000016','Grandfather'],
      ['c2','Nguyễn Hoàng Phúc', '2021-04-12','Male',  'Nguyễn Thị Thanh Tâm','0904000017','Mother'],
      ['c2','Trần Minh Châu',    '2021-06-28','Female','Trần Đình Phong',       '0904000018','Father'],
      ['c2','Lê Anh Thư',        '2021-02-17','Female','Lê Thị Bích Ngọc',     '0904000019','Mother'],
      ['c2','Phạm Đăng Khoa',    '2021-08-03','Male',  'Phạm Văn Hải',         '0904000020','Father'],
      ['c2','Võ Bảo Anh',        '2021-05-21','Female','Võ Thị Hồng Nhung',    '0904000021','Mother'],
      ['c2','Huỳnh Thiên Ân',    '2021-03-09','Male',  'Huỳnh Quốc Bảo',       '0904000022','Father'],
      ['c2','Đinh Ngọc Hân',     '2021-07-14','Female','Đinh Thị Thúy',        '0904000023','Mother'],
      ['c2','Tạ Minh Quân',      '2021-01-30','Male',  'Tạ Văn Thắng',         '0904000024','Father'],
      ['c2','Cao Phương Thảo',   '2021-09-06','Female','Cao Thị Mai Hoa',       '0904000025','Mother'],
      ['c2','Lương Gia Hưng',    '2021-04-25','Male',  'Lương Đức Trí',         '0904000026','Father'],
      ['c2','Đoàn Khánh An',     '2021-06-11','Female','Đoàn Thị Diệu Linh',   '0904000027','Mother'],
      ['c2','Hà Tuấn Anh',       '2021-02-02','Male',  'Hà Văn Quyết',         '0904000028','Father'],
      ['c2','Chu Bảo Trâm',      '2021-08-19','Female','Chu Thị Nga',           '0904000029','Grandmother'],
      ['c2','Kiều Đức Anh',      '2021-05-05','Male',  'Kiều Thị Loan',         '0904000030','Mother'],
      ['c2','Thái Ngọc Mai',     '2021-03-23','Female','Thái Văn Lộc',          '0904000031','Father'],
    ];

    const streets = ['Trần Phú', 'Lê Lợi', 'Nguyễn Trãi', 'Hai Bà Trưng', 'Quang Trung', 'Điện Biên Phủ'];

    for (let i = 0; i < studentsData.length; i++) {
      const n = i + 1;
      const [classId, sName, dob, gender, pName, pPhone, rel] = studentsData[i];
      const stId = `st${n}`;
      const parId = `par${n}`;
      const street = streets[i % streets.length];
      const addr = `${10 + n * 3} ${street}, Hải Châu, Đà Nẵng`;

      await req().query(`
        INSERT INTO Students (Id, Name, Dob, Gender, ClassId, SchoolId, Status)
        VALUES ('${stId}', N'${sName}', '${dob}', '${gender}', '${classId}', 's1', 'Active')
      `);

      await req().query(`
        INSERT INTO Parents (Id, Name, Phone, Email, Address, PasswordHash, CameraAccess, Status, CreatedAt, LastLogin)
        VALUES (
          '${parId}', N'${pName}', '${pPhone}',
          'parent${n}@gmail.com',
          N'${addr}',
          '${DEFAULT_PW}', 1, 'Active',
          ${ago(60 * 24 * (40 + n))},
          ${ago(60 * (n * 5))}
        )
      `);

      await req().query(`
        INSERT INTO ParentStudentLinks (Id, ParentId, StudentId, Relationship, Status)
        VALUES ('l${n}', '${parId}', '${stId}', '${rel}', 'Active')
      `);
    }

    // ── 9. Cameras ──────────────────────────────────────────────────
    await req().query(`
      INSERT INTO Cameras (Id, Name, ClassId, Status)
      VALUES ('cam1', 'Camera 01', 'c1', 'Active'), ('cam2', 'Camera 02', 'c2', 'Active')
    `);

    // ── 10. Camera Schedules ─────────────────────────────────────────
    const today = new Date().toISOString().slice(0, 10);
    const tomorrow = new Date(Date.now() + 86400000).toISOString().slice(0, 10);
    await req().query(`
      INSERT INTO CameraSchedules (Id, ClassId, CameraId, Date, StartTime, EndTime, Enabled)
      VALUES
        ('sch1', 'c1', 'cam1', '${today}',    '08:00', '09:30', 1),
        ('sch2', 'c2', 'cam2', '${today}',    '14:00', '15:30', 1),
        ('sch3', 'c1', 'cam1', '${tomorrow}', '08:00', '09:30', 1),
        ('sch4', 'c2', 'cam2', '${tomorrow}', '14:00', '15:30', 1)
    `);

    // ── 11. Attendance ───────────────────────────────────────────────
    // Insert today's attendance for class 1 (st9 absent)
    for (let i = 1; i <= 16; i++) {
      const status = i === 9 ? 'absent' : 'present';
      const note   = i === 9 ? 'Gia đình xin nghỉ, bé bị sốt nhẹ' : '';
      await req().query(`
        INSERT INTO Attendance (Id, ClassId, StudentId, Date, Status, Note, SavedAt)
        VALUES ('att_c1_${i}_${today}', 'c1', 'st${i}', '${today}', '${status}', N'${note}', ${ago(140)})
      `);
    }

    // ── 12. Journals ─────────────────────────────────────────────────
    const y1 = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
    const y2 = new Date(Date.now() - 2 * 86400000).toISOString().slice(0, 10);
    await req().query(`
      INSERT INTO Journals (Id, ClassId, Date, Status, Source, Meal, Learning, Sleep, Health, Emotion, Note, Photos, UpdatedAt, PublishedAt)
      VALUES (
        'j1', 'c1', '${y1}', 'published', 'voice',
        N'Các con ăn ngon miệng, hầu hết ăn hết suất cơm với canh bí đỏ và thịt viên sốt cà chua.',
        N'Cả lớp tham gia hoạt động vẽ tranh chủ đề "Gia đình của bé".',
        N'Các con ngủ trưa khoảng 90 phút, giấc ngủ sâu.',
        N'Không có biểu hiện bất thường về sức khỏe.',
        N'Các con vui vẻ, hoạt bát, hòa đồng với bạn.',
        N'Minh An mạnh dạn giơ tay phát biểu trong giờ học.',
        '[]',
        ${ago(60 * 24 - 60 * 3)},
        ${ago(60 * 24 - 60 * 3)}
      )
    `);
    await req().query(`
      INSERT INTO Journals (Id, ClassId, Date, Status, Source, Meal, Learning, Sleep, Health, Emotion, Note, Photos, UpdatedAt, PublishedAt)
      VALUES (
        'j2', 'c1', '${y2}', 'published', 'manual',
        N'Bữa trưa có cháo gà và rau củ luộc. Các con ăn tốt.',
        N'Các con học đếm số từ 1 đến 10 qua trò chơi xếp khối gỗ.',
        N'Cả lớp ngủ trưa đúng giờ, khoảng 80 phút.',
        N'Sức khỏe các con ổn định.',
        N'Các con vui vẻ trong giờ chơi ngoài trời.',
        N'',
        '[]',
        ${ago(60 * 48 - 60 * 3)},
        ${ago(60 * 48 - 60 * 3)}
      )
    `);

    // ── 13. Announcements ────────────────────────────────────────────
    const nextWeek = new Date(Date.now() + 6 * 86400000).toISOString().slice(0, 10);
    await req().query(`
      INSERT INTO Announcements (Id, Title, Content, Audience, Category, PublishDate, ExpiryDate, Status, SchoolId, CreatedAt)
      VALUES
      (
        'an1', N'Holiday Notice',
        N'Nhà trường nghỉ ngày thứ Hai tuần tới. Các con đi học lại bình thường vào thứ Ba.',
        'Teachers & Parents', 'Holiday', '${y1}', '${nextWeek}', 'Published', 's1', ${ago(60 * 22)}
      ),
      (
        'an2', N'Hội thi "Bé khéo tay"',
        N'Hội thi "Bé khéo tay" sẽ diễn ra vào sáng thứ Sáu tại sân trường.',
        'Parents', 'School Activity', '${y2}', '${nextWeek}', 'Published', 's1', ${ago(60 * 70)}
      )
    `);

    // ── 14. Messages ─────────────────────────────────────────────────
    await req().query(`
      INSERT INTO Messages (Id, ParentId, TeacherId, FromRole, Text, IsRead, SentAt)
      VALUES
        ('m1','par1','t1','parent',N'Chào cô Mai, hôm qua bé An ngủ hơi muộn, nhờ cô để ý giúp em nhé.',1,${ago(60*26)}),
        ('m2','par1','t1','teacher',N'Dạ chào chị Hương, em sẽ để ý bé và báo lại ạ.',1,${ago(60*25+40)}),
        ('m3','par1','t1','teacher',N'Trưa nay bé An ngủ được khoảng 90 phút, dậy rất tươi tỉnh.',1,${ago(60*21)}),
        ('m4','par1','t1','parent',N'Cảm ơn cô nhiều ạ. Chiều nay em đón bé sớm lúc 4 giờ được không cô?',0,${ago(48)}),
        ('m5','par2','t1','parent',N'Cô ơi, bé Ngọc để quên bình nước ở lớp, cô cất giúp em với ạ.',0,${ago(60*5)})
    `);

    // ── 15. Notifications ───────────────────────────────────────────
    await req().query(`
      INSERT INTO Notifications (Id, Role, UserId, ClassId, Type, Title, Body, SentAt)
      VALUES
        ('n1','parent',NULL,NULL,'announcement',N'Holiday Notice',N'School will be closed on Monday.',${ago(60*22)}),
        ('n2','teacher',NULL,NULL,'announcement',N'Holiday Notice',N'School will be closed on Monday.',${ago(60*22)}),
        ('n3','parent',NULL,'c1','journal',N'New journal published',N'The daily journal for Mặt Trời 1 is ready.',${ago(60*21)}),
        ('n4','parent',NULL,'c1','camera',N'Camera schedule updated',N'Camera available today during scheduled time.',${ago(150)}),
        ('n5','parent','par1',NULL,'message',N'Message from Nguyễn Thị Mai',N'Trưa nay bé An ngủ được khoảng 90 phút…',${ago(60*21)})
    `);

    await req().query(`
      INSERT INTO NotificationReads (NotificationId, UserId, ReadAt)
      VALUES ('n3','par1',${ago(60*20)}), ('n5','par1',${ago(60*20)})
    `);

    // ── 16. Audit Logs ───────────────────────────────────────────────
    const audits = [
      ['au1', 'a1',  'Lê Quang Huy',    'System Admin', 'Create', 'Schools',     'School created: Mầm non Kinder Stars',         'Success', ago(60*24*118)],
      ['au2', 'a1',  'Lê Quang Huy',    'System Admin', 'Create', 'Principals',  'Principal account created: Trần Thị Lan',     'Success', ago(60*24*118-5)],
      ['au3', 'pr1', 'Trần Thị Lan',    'Principal',    'Create', 'Teachers',    'Teacher account created: Nguyễn Thị Mai',    'Success', ago(60*24*100)],
      ['au4', 'pr1', 'Trần Thị Lan',    'Principal',    'Update', 'Students',    'Student information updated: Đỗ Nhật Nam',   'Success', ago(60*50)],
      ['au5', 't1',  'Nguyễn Thị Mai',  'Teacher',      'Publish','Daily Journal','Journal published: Mặt Trời 1',             'Success', ago(60*21)],
      ['au6', 'pr1', 'Trần Thị Lan',    'Principal',    'Publish','Announcements','Announcement published: Holiday Notice',     'Success', ago(60*22)],
      ['au7', 't1',  'Nguyễn Thị Mai',  'Teacher',      'Update', 'Attendance',  'Attendance saved: Mặt Trời 1',              'Success', ago(140)],
    ];
    for (const [id, uid, uname, urole, action, module, desc, status, createdAt] of audits) {
      await req().query(`
        INSERT INTO AuditLogs (Id, UserId, UserName, UserRole, Action, Module, Description, Status, CreatedAt)
        VALUES ('${id}','${uid}',N'${uname}','${urole}','${action}','${module}',N'${desc}','${status}',${createdAt})
      `);
    }

    // ── 17. System Settings ──────────────────────────────────────────
    const settings = [
      ['platformName',   'KinderLog'],
      ['supportEmail',   'hotro@kinderlog.vn'],
      ['sessionTimeout', '60'],
      ['passwordMin',    '6'],
      ['aiJournal',      'true'],
      ['sttLanguage',    'Vietnamese'],
      ['maxPhotos',      '6'],
    ];
    for (const [k, v] of settings) {
      await req().query(`
        INSERT INTO SystemSettings (SettingKey, SettingValue)
        VALUES ('${k}', '${v}')
      `);
    }

    console.log('✅ Seeding completed successfully!');
    console.log('');
    console.log('📋 Test accounts (password: 123456):');
    console.log('   Admin    : 0901000001');
    console.log('   Principal: 0902000001');
    console.log('   Teacher  : 0903000001');
    console.log('   Parent   : 0904000001');
    process.exit(0);
  } catch (err) {
    console.error('❌ Seeding failed:', err.message);
    console.error(err);
    process.exit(1);
  }
}

seed();

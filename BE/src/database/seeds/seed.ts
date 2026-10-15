/**
 * Demo data matching FE/src/store/seed.js (same names, phone numbers and password) plus two weeks of
 * journals so the dashboard and reports have something to show. Re-runnable: it wipes all tables first.
 *
 *   npm run seed
 */
import * as bcrypt from 'bcryptjs';
import {
  AttendanceStatus,
  Gender,
  HealthStatus,
  JournalSource,
  JournalStatus,
  MealLevel,
  Mood,
  RecordStatus,
  Relationship,
  SleepQuality,
  UserRole,
} from '../../common/enums';
import { addDays, isoDate, weekdayOf } from '../../common/utils/date.util';
import { CameraStream } from '../../modules/camera-streams/entities/camera-stream.entity';
import { ClassEntity } from '../../modules/classes/entities/class.entity';
import { DailyJournal } from '../../modules/daily-journals/entities/daily-journal.entity';
import { JournalPhoto } from '../../modules/daily-journals/entities/journal-photo.entity';
import { School } from '../../modules/schools/entities/school.entity';
import { ParentStudentMap } from '../../modules/students/entities/parent-student-map.entity';
import { Student } from '../../modules/students/entities/student.entity';
import { User } from '../../modules/users/entities/user.entity';
import dataSource from '../data-source';

type Row = [student: string, dob: string, gender: 'Male' | 'Female', parent: string, rel: string];

const CLASS_1: Row[] = [
  ['Nguyễn Minh An', '2022-03-14', 'Male', 'Nguyễn Thị Hương', 'Mother'],
  ['Trần Bảo Ngọc', '2022-01-22', 'Female', 'Trần Văn Dũng', 'Father'],
  ['Lê Gia Huy', '2021-11-05', 'Male', 'Phạm Thị Thu', 'Mother'],
  ['Phạm Khánh Linh', '2022-05-30', 'Female', 'Phạm Quốc Tuấn', 'Father'],
  ['Hoàng Đức Minh', '2021-12-18', 'Male', 'Vũ Thị Hạnh', 'Mother'],
  ['Vũ Ngọc Diệp', '2022-02-09', 'Female', 'Vũ Minh Khôi', 'Father'],
  ['Đặng Tuấn Kiệt', '2022-07-21', 'Male', 'Đặng Thị Lan Anh', 'Mother'],
  ['Bùi Thảo Vy', '2022-04-02', 'Female', 'Bùi Văn Long', 'Father'],
  ['Đỗ Nhật Nam', '2021-10-27', 'Male', 'Lý Thị Kim Oanh', 'Mother'],
  ['Ngô Hà My', '2022-06-15', 'Female', 'Ngô Thanh Tùng', 'Father'],
  ['Dương Quang Khải', '2022-08-08', 'Male', 'Dương Thị Mỹ Duyên', 'Mother'],
  ['Lý An Nhiên', '2022-03-03', 'Female', 'Lý Hoàng Nam', 'Father'],
  ['Trịnh Bảo Long', '2021-09-19', 'Male', 'Trịnh Thị Phương', 'Mother'],
  ['Mai Tuệ Lâm', '2022-01-11', 'Female', 'Mai Văn Sơn', 'Father'],
  ['Phan Gia Bảo', '2022-05-07', 'Male', 'Phan Thị Yến', 'Mother'],
  ['Hồ Khả Hân', '2022-02-25', 'Female', 'Hồ Sỹ Hùng', 'Grandfather'],
];

const CLASS_2: Row[] = [
  ['Nguyễn Hoàng Phúc', '2021-04-12', 'Male', 'Nguyễn Thị Thanh Tâm', 'Mother'],
  ['Trần Minh Châu', '2021-06-28', 'Female', 'Trần Đình Phong', 'Father'],
  ['Lê Anh Thư', '2021-02-17', 'Female', 'Lê Thị Bích Ngọc', 'Mother'],
  ['Phạm Đăng Khoa', '2021-08-03', 'Male', 'Phạm Văn Hải', 'Father'],
  ['Võ Bảo Anh', '2021-05-21', 'Female', 'Võ Thị Hồng Nhung', 'Mother'],
  ['Huỳnh Thiên Ân', '2021-03-09', 'Male', 'Huỳnh Quốc Bảo', 'Father'],
  ['Đinh Ngọc Hân', '2021-07-14', 'Female', 'Đinh Thị Thúy', 'Mother'],
  ['Tạ Minh Quân', '2021-01-30', 'Male', 'Tạ Văn Thắng', 'Father'],
  ['Cao Phương Thảo', '2021-09-06', 'Female', 'Cao Thị Mai Hoa', 'Mother'],
  ['Lương Gia Hưng', '2021-04-25', 'Male', 'Lương Đức Trí', 'Father'],
  ['Đoàn Khánh An', '2021-06-11', 'Female', 'Đoàn Thị Diệu Linh', 'Mother'],
  ['Hà Tuấn Anh', '2021-02-02', 'Male', 'Hà Văn Quyết', 'Father'],
  ['Chu Bảo Trâm', '2021-08-19', 'Female', 'Chu Thị Nga', 'Grandmother'],
  ['Kiều Đức Anh', '2021-05-05', 'Male', 'Kiều Thị Loan', 'Mother'],
  ['Thái Ngọc Mai', '2021-03-23', 'Female', 'Thái Văn Lộc', 'Father'],
];

const ALLERGIES: Record<string, string> = {
  'Lê Gia Huy': 'Dị ứng tôm, cua',
  'Ngô Hà My': 'Dị ứng sữa bò',
  'Phạm Đăng Khoa': 'Dị ứng đậu phộng',
};

const STREETS = [
  'Trần Phú',
  'Lê Lợi',
  'Nguyễn Trãi',
  'Hai Bà Trưng',
  'Quang Trung',
  'Điện Biên Phủ',
  'Lý Thường Kiệt',
];

const slug = (name: string) =>
  name
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[đĐ]/g, 'd')
    .toLowerCase()
    .split(/\s+/)
    .slice(-2)
    .reverse()
    .join('.');

/** Deterministic PRNG so every seed run produces the same demo. */
function rng(seed: number) {
  return () => {
    seed = (seed * 1664525 + 1013904223) % 4294967296;
    return seed / 4294967296;
  };
}

const LESSONS = [
  'Cả lớp vẽ tranh chủ đề “Gia đình của bé”, các con hào hứng giới thiệu bức tranh của mình.',
  'Các con học đếm số từ 1 đến 10 qua trò chơi xếp khối gỗ.',
  'Hoạt động kể chuyện “Thỏ và Rùa”, các con trả lời câu hỏi của cô rất tốt.',
  'Cả lớp tập hát bài “Cả nhà thương nhau” và vận động theo nhạc.',
  'Các con nặn đất sét tạo hình con vật yêu thích.',
  'Trò chơi vận động ngoài trời “Mèo đuổi chuột”.',
];
const MEALS = [
  'Cơm, canh bí đỏ, thịt viên sốt cà chua.',
  'Cháo gà và rau củ luộc.',
  'Cơm, cá sốt cà, canh rau ngót.',
  'Bún bò, chuối tráng miệng.',
  'Cơm, trứng chiên, canh cải.',
];
const PHOTOS = ['drawing', 'meal', 'play', 'book', 'music'];

export async function runSeed({ quiet = false } = {}) {
  if (!dataSource.isInitialized) await dataSource.initialize();
  const tz = process.env.APP_TIMEZONE ?? 'Asia/Ho_Chi_Minh';
  const today = isoDate(tz);
  const passwordHash = await bcrypt.hash(process.env.DEFAULT_PASSWORD ?? '123456', 10);

  await dataSource.transaction(async (tx) => {
    await tx.query(
      `TRUNCATE journal_photos, daily_journals, camera_streams, parent_student_map, students, classes, users, schools RESTART IDENTITY CASCADE`,
    );

    const user = (u: Partial<User>) =>
      tx.getRepository(User).create({ passwordHash, status: RecordStatus.ACTIVE, ...u });

    // ---- tenants ----
    const school = await tx.getRepository(School).save({
      name: 'Mầm non Kinder Stars',
      address: '25 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
      phone: '02363888999',
      email: 'lienhe@kinderstars.edu.vn',
    });
    const school2 = await tx.getRepository(School).save({
      name: 'Mầm non Hoa Sen',
      address: '102 Lê Duẩn, Thanh Khê, Đà Nẵng',
      phone: '02363777666',
      email: 'lienhe@hoasen.edu.vn',
    });

    // ---- staff ----
    const [, , t1, t2] = await tx.getRepository(User).save([
      user({
        fullName: 'Lê Quang Huy',
        phone: '0901000001',
        email: 'huy.le@kinderlog.vn',
        role: UserRole.SYSTEM_ADMIN,
      }),
      user({
        fullName: 'Trần Thị Lan',
        phone: '0902000001',
        email: 'lan.tran@kinderstars.edu.vn',
        role: UserRole.PRINCIPAL,
        schoolId: school.id,
      }),
      user({
        fullName: 'Nguyễn Thị Mai',
        phone: '0903000001',
        email: 'mai.nguyen@kinderstars.edu.vn',
        role: UserRole.TEACHER,
        schoolId: school.id,
      }),
      user({
        fullName: 'Phạm Thu Hà',
        phone: '0903000002',
        email: 'ha.pham@kinderstars.edu.vn',
        role: UserRole.TEACHER,
        schoolId: school.id,
      }),
      user({
        fullName: 'Lê Thị Ngọc Ánh',
        phone: '0903000003',
        email: 'anh.le@kinderstars.edu.vn',
        role: UserRole.TEACHER,
        schoolId: school.id,
      }),
      user({
        fullName: 'Đỗ Thị Thanh Vân',
        phone: '0903000004',
        email: 'van.do@kinderstars.edu.vn',
        role: UserRole.TEACHER,
        schoolId: school.id,
        status: RecordStatus.INACTIVE,
      }),
      user({
        fullName: 'Võ Thị Kim Chi',
        phone: '0902000002',
        email: 'chi.vo@hoasen.edu.vn',
        role: UserRole.PRINCIPAL,
        schoolId: school2.id,
      }),
    ]);

    const [c1, c2] = await tx.getRepository(ClassEntity).save([
      {
        schoolId: school.id,
        name: 'Mặt Trời 1',
        academicYear: '2026-2027',
        ageGroup: '4-5 tuổi',
        homeroomTeacherId: t1.id,
      },
      {
        schoolId: school.id,
        name: 'Mặt Trời 2',
        academicYear: '2026-2027',
        ageGroup: '5-6 tuổi',
        homeroomTeacherId: t2.id,
      },
    ]);

    // ---- students, parents and the N-N map ----
    const students: Student[] = [];
    let n = 0;
    for (const [cls, rows] of [
      [c1, CLASS_1],
      [c2, CLASS_2],
    ] as const) {
      for (const [name, dob, gender, parentName, rel] of rows) {
        n += 1;
        const student = await tx.getRepository(Student).save({
          classId: cls.id,
          fullName: name,
          dateOfBirth: dob,
          gender: gender === 'Male' ? Gender.MALE : Gender.FEMALE,
          allergies: ALLERGIES[name] ?? null,
        });
        const parent = await tx.getRepository(User).save(
          user({
            fullName: parentName,
            phone: `09040000${String(n).padStart(2, '0')}`,
            email: `${slug(parentName)}${n > 1 ? n : ''}@gmail.com`,
            address: `${10 + n * 3} ${STREETS[n % STREETS.length]}, Hải Châu, Đà Nẵng`,
            role: UserRole.PARENT,
            schoolId: school.id,
          }),
        );
        await tx.getRepository(ParentStudentMap).save({
          parentId: parent.id,
          studentId: student.id,
          relationship: rel.toUpperCase() as Relationship,
          isPrimary: true,
        });
        students.push(student);
      }
    }

    // ---- cameras: Mặt Trời 1 is open all day, every day, so the demo always has a LIVE feed ----
    await tx.getRepository(CameraStream).save([
      {
        classId: c1.id,
        name: 'Camera 01 – Phòng học',
        streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        allowedStartTime: '00:00',
        allowedEndTime: '23:59',
        allowedWeekdays: 254,
      },
      {
        classId: c2.id,
        name: 'Camera 02 – Phòng học',
        streamUrl: 'https://test-streams.mux.dev/x36xhzz/x36xhzz.m3u8',
        allowedStartTime: '14:00',
        allowedEndTime: '15:30',
        allowedWeekdays: 62,
      },
      {
        classId: c2.id,
        name: 'Camera 03 – Sân chơi',
        streamUrl:
          'https://demo.unified-streaming.com/k8s/features/stable/video/tears-of-steel/tears-of-steel.ism/.m3u8',
        allowedStartTime: '09:00',
        allowedEndTime: '10:00',
        allowedWeekdays: 62,
        isActive: false,
      },
    ]);

    // ---- two weeks of approved journals (school days only) ----
    const rand = rng(42);
    const pick = <T>(xs: readonly T[]) => xs[Math.floor(rand() * xs.length)];
    const journals: DailyJournal[] = [];
    for (let back = 14; back >= 1; back--) {
      const date = addDays(today, -back);
      if (weekdayOf(date) > 5) continue;
      for (const [cls, teacher] of [
        [c1, t1],
        [c2, t2],
      ] as const) {
        const lesson = pick(LESSONS);
        const meal = pick(MEALS);
        // In the last 3 days Mặt Trời 2 forgot to approve, which shows up in the submission rate.
        const approved = !(cls === c2 && back <= 3 && rand() < 0.6);
        for (const s of students.filter((x) => x.classId === cls.id)) {
          const r = rand();
          const absent = r < 0.06;
          const sick = !absent && r < 0.1;
          journals.push(
            tx.getRepository(DailyJournal).create({
              studentId: s.id,
              classId: cls.id,
              journalDate: date,
              attendance: absent ? AttendanceStatus.ABSENT : AttendanceStatus.PRESENT,
              absenceReason: absent ? 'Gia đình xin nghỉ' : null,
              mealLevel: absent
                ? null
                : sick
                  ? MealLevel.LITTLE
                  : pick([MealLevel.ALL, MealLevel.ALL, MealLevel.MOST, MealLevel.HALF]),
              mealNote: absent ? null : meal,
              sleepMinutes: absent ? null : 70 + Math.floor(rand() * 5) * 10,
              sleepQuality: absent ? null : pick([SleepQuality.GOOD, SleepQuality.GOOD, SleepQuality.FAIR]),
              learningNote: absent ? null : lesson,
              healthStatus: absent ? null : sick ? HealthStatus.MONITOR : HealthStatus.NORMAL,
              temperature: sick ? 37.6 + Math.round(rand() * 5) / 10 : null,
              healthNote: sick ? 'Bé hơi sốt nhẹ, cô đã báo phụ huynh.' : null,
              mood: absent ? null : sick ? Mood.TIRED : pick([Mood.HAPPY, Mood.HAPPY, Mood.CALM]),
              teacherNote: null,
              status: approved ? JournalStatus.APPROVED : JournalStatus.DRAFT,
              source: pick([JournalSource.BULK, JournalSource.VOICE]),
              isException: sick || absent,
              createdById: teacher.id,
              approvedById: approved ? teacher.id : null,
              approvedAt: approved ? new Date(`${date}T16:30:00+07:00`) : null,
            }),
          );
        }
      }
    }
    // Today: Mặt Trời 2 has started (meal only, draft); Mặt Trời 1 is left empty for the live bulk/voice demo.
    for (const s of students.filter((x) => x.classId === c2.id)) {
      journals.push(
        tx.getRepository(DailyJournal).create({
          studentId: s.id,
          classId: c2.id,
          journalDate: today,
          mealLevel: MealLevel.MOST,
          mealNote: 'Các con ăn sáng với phở bò, ăn khá tốt.',
          status: JournalStatus.DRAFT,
          source: JournalSource.BULK,
          createdById: t2.id,
        }),
      );
    }
    const saved = await tx.getRepository(DailyJournal).save(journals, { chunk: 200 });

    // A couple of activity photos on the approved days of Mặt Trời 1.
    const photos = saved
      .filter(
        (j) =>
          j.classId === c1.id &&
          j.status === JournalStatus.APPROVED &&
          j.attendance === AttendanceStatus.PRESENT,
      )
      .map((j) =>
        tx.getRepository(JournalPhoto).create({
          journalId: j.id,
          url: `https://picsum.photos/seed/kinder-${j.journalDate}-${PHOTOS[Number(j.journalDate.slice(-1)) % PHOTOS.length]}/800/600`,
          caption: 'Hoạt động của lớp',
          uploadedById: t1.id,
        }),
      );
    await tx.getRepository(JournalPhoto).save(photos, { chunk: 200 });

    if (!quiet)
      console.log(
        `Seeded: 2 schools, ${students.length} students, ${saved.length} journal entries, ${photos.length} photos`,
      );
  });

  if (!quiet)
    console.log(`
Demo accounts (password: ${process.env.DEFAULT_PASSWORD ?? '123456'})
  SYSTEM_ADMIN  0901000001  Lê Quang Huy
  PRINCIPAL     0902000001  Trần Thị Lan      (Mầm non Kinder Stars)
  TEACHER       0903000001  Nguyễn Thị Mai    (Mặt Trời 1)
  TEACHER       0903000002  Phạm Thu Hà       (Mặt Trời 2)
  PARENT        0904000001  Nguyễn Thị Hương  (mẹ bé Nguyễn Minh An – Mặt Trời 1)
`);
  await dataSource.destroy();
}

if (require.main === module) {
  runSeed().catch(async (err) => {
    console.error(err);
    await dataSource.destroy().catch(() => undefined);
    process.exit(1);
  });
}

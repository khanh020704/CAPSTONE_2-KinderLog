import { addDays, todayISO } from '../lib/utils'

// [student, date of birth, gender, parent, relationship]
const CLASS_1 = [
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
]

const CLASS_2 = [
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
]

const STREETS = ['Trần Phú', 'Lê Lợi', 'Nguyễn Trãi', 'Hai Bà Trưng', 'Quang Trung', 'Điện Biên Phủ', 'Lý Thường Kiệt']

const slug = (name) => name.normalize('NFD').replace(/[̀-ͯ]/g, '').replace(/[đĐ]/g, 'd').toLowerCase().split(/\s+/).slice(-2).reverse().join('.')

export function seed() {
  const today = todayISO()
  const now = Date.now()
  const ago = (min) => now - min * 60000

  const students = []
  const parents = []
  const links = []
  ;[
    ['c1', CLASS_1],
    ['c2', CLASS_2],
  ].forEach(([classId, rows]) => {
    rows.forEach(([name, dob, gender, parentName, relationship]) => {
      const n = students.length + 1
      students.push({ id: `st${n}`, name, dob, gender, classId, status: 'Active', note: '', photo: '' })
      parents.push({
        id: `par${n}`,
        name: parentName,
        phone: `09040000${String(n).padStart(2, '0')}`,
        email: `${slug(parentName)}${n > 1 ? n : ''}@gmail.com`,
        address: `${10 + n * 3} ${STREETS[n % STREETS.length]}, Hải Châu, Đà Nẵng`,
        status: 'Active',
        cameraAccess: true,
        createdAt: ago(60 * 24 * (40 + n)),
        lastLogin: ago(60 * (n * 5)),
      })
      links.push({ id: `l${n}`, parentId: `par${n}`, studentId: `st${n}`, relationship, status: 'Active' })
    })
  })

  const y1 = addDays(today, -1)
  const y3 = addDays(today, -3)

  return {
    version: 4,
    schools: [
      {
        id: 's1',
        name: 'Mầm non Kinder Stars',
        address: '25 Nguyễn Văn Linh, Hải Châu, Đà Nẵng',
        phone: '02363888999',
        email: 'lienhe@kinderstars.edu.vn',
        principalId: 'pr1',
        status: 'Active',
        createdAt: ago(60 * 24 * 120),
      },
    ],
    admins: [
      {
        id: 'a1',
        name: 'Lê Quang Huy',
        phone: '0901000001',
        email: 'huy.le@kinderlog.vn',
        status: 'Active',
        lastLogin: ago(90),
      },
    ],
    principals: [
      {
        id: 'pr1',
        name: 'Trần Thị Lan',
        phone: '0902000001',
        email: 'lan.tran@kinderstars.edu.vn',
        schoolId: 's1',
        status: 'Active',
        createdAt: ago(60 * 24 * 118),
        lastLogin: ago(35),
      },
    ],
    years: [
      { id: 'y2', name: '2026–2027', start: '2026-09-05', end: '2027-05-31', status: 'Current' },
      { id: 'y1', name: '2025–2026', start: '2025-09-05', end: '2026-05-31', status: 'Archived' },
    ],
    classes: [
      { id: 'c1', name: 'Mặt Trời 1', yearId: 'y2', teacherId: 't1', status: 'Active' },
      { id: 'c2', name: 'Mặt Trời 2', yearId: 'y2', teacherId: 't2', status: 'Active' },
    ],
    teachers: [
      { id: 't1', name: 'Nguyễn Thị Mai', phone: '0903000001', email: 'mai.nguyen@kinderstars.edu.vn', status: 'Active', createdAt: ago(60 * 24 * 100), lastLogin: ago(20) },
      { id: 't2', name: 'Phạm Thu Hà', phone: '0903000002', email: 'ha.pham@kinderstars.edu.vn', status: 'Active', createdAt: ago(60 * 24 * 98), lastLogin: ago(55) },
      { id: 't3', name: 'Lê Thị Ngọc Ánh', phone: '0903000003', email: 'anh.le@kinderstars.edu.vn', status: 'Active', createdAt: ago(60 * 24 * 60), lastLogin: ago(60 * 26) },
      {
        id: 't4',
        name: 'Đỗ Thị Thanh Vân',
        phone: '0903000004',
        email: 'van.do@kinderstars.edu.vn',
        status: 'Inactive',
        createdAt: ago(60 * 24 * 90),
        lastLogin: ago(60 * 24 * 21),
      },
    ],
    students,
    parents,
    links,
    messages: [
      {
        id: 'm1',
        parentId: 'par1',
        teacherId: 't1',
        from: 'parent',
        text: 'Chào cô Mai, hôm qua bé An ngủ hơi muộn, nhờ cô để ý giúp em giấc trưa của bé nhé.',
        at: ago(60 * 26),
        read: true,
      },
      { id: 'm2', parentId: 'par1', teacherId: 't1', from: 'teacher', text: 'Dạ chào chị Hương, em sẽ để ý bé và báo lại cho chị ạ.', at: ago(60 * 25 + 40), read: true },
      { id: 'm3', parentId: 'par1', teacherId: 't1', from: 'teacher', text: 'Trưa nay bé An ngủ được khoảng 90 phút, dậy rất tươi tỉnh chị nhé.', at: ago(60 * 21), read: true },
      { id: 'm4', parentId: 'par1', teacherId: 't1', from: 'parent', text: 'Cảm ơn cô nhiều ạ. Chiều nay em đón bé sớm lúc 4 giờ được không cô?', at: ago(48), read: false },
      { id: 'm5', parentId: 'par2', teacherId: 't1', from: 'parent', text: 'Cô ơi, bé Ngọc để quên bình nước ở lớp, cô cất giúp em với ạ.', at: ago(60 * 5), read: false },
      { id: 'm6', parentId: 'par4', teacherId: 't1', from: 'teacher', text: 'Chào anh Tuấn, hôm nay bé Linh ăn rất giỏi ạ.', at: ago(60 * 28), read: true },
      { id: 'm7', parentId: 'par4', teacherId: 't1', from: 'parent', text: 'Cảm ơn cô, gia đình rất vui ạ.', at: ago(60 * 27), read: true },
    ],
    announcements: [
      {
        id: 'an1',
        title: 'Holiday Notice',
        content: 'Nhà trường nghỉ ngày thứ Hai tuần tới. Các con đi học lại bình thường vào thứ Ba. Kính mong quý phụ huynh sắp xếp đưa đón bé.',
        audience: 'Teachers & Parents',
        category: 'Holiday',
        publishDate: y1,
        expiryDate: addDays(today, 6),
        status: 'Published',
        createdAt: ago(60 * 22),
      },
      {
        id: 'an2',
        title: 'Hội thi “Bé khéo tay”',
        content: 'Hội thi “Bé khéo tay” sẽ diễn ra vào sáng thứ Sáu tại sân trường. Phụ huynh có thể đăng ký tham gia cùng bé với giáo viên chủ nhiệm.',
        audience: 'Parents',
        category: 'School Activity',
        publishDate: y3,
        expiryDate: addDays(today, 4),
        status: 'Published',
        createdAt: ago(60 * 70),
      },
      {
        id: 'an3',
        title: 'Họp chuyên môn tháng 10',
        content: 'Giáo viên họp chuyên môn lúc 16:30 thứ Năm tại phòng hội đồng.',
        audience: 'Teachers',
        category: 'Reminder',
        publishDate: addDays(today, 1),
        expiryDate: addDays(today, 5),
        status: 'Draft',
        createdAt: ago(60 * 3),
      },
    ],
    notifications: [
      { id: 'n1', role: 'parent', userId: null, type: 'announcement', title: 'Holiday Notice', body: 'School will be closed on Monday.', at: ago(60 * 22), readBy: [] },
      { id: 'n2', role: 'teacher', userId: null, type: 'announcement', title: 'Holiday Notice', body: 'School will be closed on Monday.', at: ago(60 * 22), readBy: [] },
      {
        id: 'n3',
        role: 'parent',
        classId: 'c1',
        type: 'journal',
        title: 'New journal published',
        body: 'The daily journal for Mặt Trời 1 is ready to view.',
        at: ago(60 * 21),
        readBy: ['par1'],
      },
      {
        id: 'n4',
        role: 'parent',
        classId: 'c1',
        type: 'camera',
        title: 'Camera schedule updated',
        body: 'Mặt Trời 1 camera is available today during the scheduled time.',
        at: ago(150),
        readBy: [],
      },
      {
        id: 'n5',
        role: 'parent',
        userId: 'par1',
        type: 'message',
        title: 'Message from Nguyễn Thị Mai',
        body: 'Trưa nay bé An ngủ được khoảng 90 phút…',
        at: ago(60 * 21),
        readBy: ['par1'],
      },
      { id: 'n6', role: 'parent', userId: null, type: 'announcement', title: 'Hội thi “Bé khéo tay”', body: 'Sáng thứ Sáu tại sân trường.', at: ago(60 * 70), readBy: ['par1'] },
      {
        id: 'n7',
        role: 'teacher',
        userId: 't1',
        type: 'system',
        title: 'Class roster updated',
        body: 'The principal updated the student list of Mặt Trời 1.',
        at: ago(60 * 50),
        readBy: ['t1'],
      },
      {
        id: 'n8',
        role: 'principal',
        userId: null,
        type: 'system',
        title: 'Attendance not recorded',
        body: 'Mặt Trời 2 has not recorded attendance today.',
        at: ago(30),
        readBy: [],
      },
      { id: 'n9', role: 'principal', userId: null, type: 'journal', title: 'Journal in progress', body: 'Mặt Trời 2 journal is still a draft.', at: ago(75), readBy: [] },
    ],
    audit: [
      {
        id: 'au1',
        at: ago(60 * 24 * 118),
        user: 'Lê Quang Huy',
        role: 'System Admin',
        action: 'Create',
        module: 'Schools',
        description: 'School created: Mầm non Kinder Stars',
        status: 'Success',
      },
      {
        id: 'au2',
        at: ago(60 * 24 * 118 - 5),
        user: 'Lê Quang Huy',
        role: 'System Admin',
        action: 'Create',
        module: 'Principals',
        description: 'Principal account created: Trần Thị Lan',
        status: 'Success',
      },
      {
        id: 'au3',
        at: ago(60 * 24 * 60),
        user: 'Trần Thị Lan',
        role: 'Principal',
        action: 'Activate',
        module: 'Teachers',
        description: 'Teacher account activated: Lê Thị Ngọc Ánh',
        status: 'Success',
      },
      {
        id: 'au4',
        at: ago(60 * 50),
        user: 'Trần Thị Lan',
        role: 'Principal',
        action: 'Update',
        module: 'Students',
        description: 'Student information updated: Đỗ Nhật Nam',
        status: 'Success',
      },
      {
        id: 'au5',
        at: ago(60 * 30),
        user: 'Trần Thị Lan',
        role: 'Principal',
        action: 'Update',
        module: 'Relationships',
        description: 'Parent relationship updated: Hồ Sỹ Hùng → Hồ Khả Hân',
        status: 'Success',
      },
      {
        id: 'au6',
        at: ago(60 * 22),
        user: 'Trần Thị Lan',
        role: 'Principal',
        action: 'Publish',
        module: 'Announcements',
        description: 'Announcement published: Holiday Notice',
        status: 'Success',
      },
      {
        id: 'au7',
        at: ago(60 * 21),
        user: 'Nguyễn Thị Mai',
        role: 'Teacher',
        action: 'Publish',
        module: 'Daily Journal',
        description: 'Journal published: Mặt Trời 1',
        status: 'Success',
      },
      {
        id: 'au8',
        at: ago(60 * 9),
        user: 'Đỗ Thị Thanh Vân',
        role: 'Teacher',
        action: 'Login',
        module: 'Authentication',
        description: 'Sign-in blocked: account is inactive',
        status: 'Failed',
      },
      { id: 'au9', at: ago(140), user: 'Nguyễn Thị Mai', role: 'Teacher', action: 'Update', module: 'Attendance', description: 'Attendance saved: Mặt Trời 1', status: 'Success' },
    ],
    passwords: {},
    settings: {
      platformName: 'KinderLog',
      supportEmail: 'hotro@kinderlog.vn',
      sessionTimeout: '60',
      passwordMin: '6',
      aiJournal: true,
      sttLanguage: 'Vietnamese',
      maxPhotos: '6',
    },
  }
}

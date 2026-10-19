const express = require('express');
const { query } = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errorHandler');

const router = express.Router();

// All parent routes require authentication + parent role
router.use(authenticate, authorize('parent'));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/parent/profile
// ─────────────────────────────────────────────────────────────────────────────
router.get('/profile', asyncHandler(async (req, res) => {
  const result = await query(
    'SELECT Id, Name, Phone, Email, Address, CameraAccess, Status, LastLogin, CreatedAt FROM Parents WHERE Id = @id',
    { id: req.user.id }
  );
  if (!result.recordset[0]) throw httpError(404, 'Profile not found.');
  res.json(result.recordset[0]);
}));

router.put('/profile', asyncHandler(async (req, res) => {
  const { name, email, address } = req.body;
  await query(
    'UPDATE Parents SET Name=COALESCE(@name,Name), Email=COALESCE(@email,Email), Address=COALESCE(@address,Address), UpdatedAt=@at WHERE Id=@id',
    { name: name||null, email: email||null, address: address||null, at: Date.now(), id: req.user.id }
  );
  res.json({ message: 'Profile updated.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/parent/children
// Returns all children linked to this parent
// ─────────────────────────────────────────────────────────────────────────────
router.get('/children', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT
      s.Id, s.Name, s.Dob, s.Gender, s.ClassId, s.Status, s.Note, s.Photo,
      l.Relationship,
      c.Name  AS ClassName,
      t.Name  AS TeacherName,
      t.Phone AS TeacherPhone,
      t.Email AS TeacherEmail
    FROM ParentStudentLinks l
    INNER JOIN Students  s ON s.Id = l.StudentId
    LEFT  JOIN Classes   c ON c.Id = s.ClassId
    LEFT  JOIN Teachers  t ON t.Id = c.TeacherId
    WHERE l.ParentId = @pid AND l.Status = 'Active'
  `, { pid: req.user.id });

  res.json(result.recordset);
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/parent/children/:studentId/attendance?date=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────
router.get('/children/:studentId/attendance', asyncHandler(async (req, res) => {
  await assertLinked(req.user.id, req.params.studentId);

  const { date, month } = req.query;

  let sql;
  let params = { sid: req.params.studentId };

  if (date) {
    sql = 'SELECT * FROM Attendance WHERE StudentId=@sid AND Date=@date';
    params.date = date;
  } else if (month) {
    // month = YYYY-MM  → return whole month
    sql = `SELECT * FROM Attendance WHERE StudentId=@sid AND Date LIKE @month ORDER BY Date DESC`;
    params.month = `${month}%`;
  } else {
    sql = 'SELECT TOP 30 * FROM Attendance WHERE StudentId=@sid ORDER BY Date DESC';
  }

  const result = await query(sql, params);
  res.json(result.recordset);
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/parent/children/:studentId/journals?date=YYYY-MM-DD
// ─────────────────────────────────────────────────────────────────────────────
router.get('/children/:studentId/journals', asyncHandler(async (req, res) => {
  const link = await assertLinked(req.user.id, req.params.studentId);
  const { date } = req.query;

  // Find the student's class
  const classRes = await query('SELECT ClassId FROM Students WHERE Id=@sid', { sid: req.params.studentId });
  const classId = classRes.recordset[0]?.ClassId;
  if (!classId) return res.json([]);

  let sql, params = { classId };
  if (date) {
    sql = `SELECT * FROM Journals WHERE ClassId=@classId AND Date=@date AND Status='published'`;
    params.date = date;
  } else {
    sql = `SELECT * FROM Journals WHERE ClassId=@classId AND Status='published' ORDER BY Date DESC`;
  }

  const result = await query(sql, params);
  // Parse photos JSON field
  const journals = result.recordset.map(j => ({
    ...j,
    photos: tryParseJSON(j.Photos, []),
  }));
  res.json(date ? (journals[0] || null) : journals);
}));

// ─────────────────────────────────────────────────────────────────────────────
// MESSAGES
// GET  /api/parent/messages?teacherId=xxx  – full conversation
// POST /api/parent/messages                – send a message
// ─────────────────────────────────────────────────────────────────────────────
router.get('/messages', asyncHandler(async (req, res) => {
  const parentId = req.user.id;

  // Get all teachers the parent has children under
  const teacherRes = await query(`
    SELECT DISTINCT t.Id, t.Name, t.Phone, t.Email,
      (SELECT COUNT(*) FROM Messages m
       WHERE m.ParentId=@pid AND m.TeacherId=t.Id AND m.FromRole='teacher' AND m.IsRead=0) AS UnreadCount
    FROM ParentStudentLinks l
    INNER JOIN Students s ON s.Id = l.StudentId
    INNER JOIN Classes  c ON c.Id = s.ClassId
    INNER JOIN Teachers t ON t.Id = c.TeacherId
    WHERE l.ParentId = @pid AND l.Status='Active'
  `, { pid: parentId });

  const { teacherId } = req.query;
  if (teacherId) {
    // Mark messages from teacher as read
    await query(
      'UPDATE Messages SET IsRead=1 WHERE ParentId=@pid AND TeacherId=@tid AND FromRole=\'teacher\'',
      { pid: parentId, tid: teacherId }
    );
    const msgs = await query(
      'SELECT * FROM Messages WHERE ParentId=@pid AND TeacherId=@tid ORDER BY SentAt ASC',
      { pid: parentId, tid: teacherId }
    );
    return res.json({ teachers: teacherRes.recordset, messages: msgs.recordset });
  }

  // Latest message per teacher
  const latestMsgs = await query(`
    SELECT m.* FROM Messages m
    INNER JOIN (
      SELECT TeacherId, MAX(SentAt) AS MaxAt FROM Messages WHERE ParentId=@pid GROUP BY TeacherId
    ) latest ON m.TeacherId=latest.TeacherId AND m.SentAt=latest.MaxAt AND m.ParentId=@pid
    ORDER BY m.SentAt DESC
  `, { pid: parentId });

  res.json({ teachers: teacherRes.recordset, latestMessages: latestMsgs.recordset });
}));

router.post('/messages', asyncHandler(async (req, res) => {
  const { teacherId, text } = req.body;
  if (!teacherId || !text?.trim()) throw httpError(400, 'teacherId and text are required.');

  // Verify the teacher is linked to one of the parent's children
  const linkCheck = await query(`
    SELECT 1 FROM ParentStudentLinks l
    INNER JOIN Students s ON s.Id=l.StudentId
    INNER JOIN Classes  c ON c.Id=s.ClassId
    WHERE l.ParentId=@pid AND c.TeacherId=@tid AND l.Status='Active'
  `, { pid: req.user.id, tid: teacherId });
  if (!linkCheck.recordset.length) throw httpError(403, 'You can only message teachers of your children.');

  await query(`
    INSERT INTO Messages (Id, ParentId, TeacherId, FromRole, Text, IsRead, SentAt)
    VALUES (NEWID(), @pid, @tid, 'parent', @text, 0, @at)
  `, { pid: req.user.id, tid: teacherId, text: text.trim(), at: Date.now() });

  res.status(201).json({ message: 'Message sent.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// NOTIFICATIONS
// GET  /api/parent/notifications
// PUT  /api/parent/notifications/:id/read
// ─────────────────────────────────────────────────────────────────────────────
router.get('/notifications', asyncHandler(async (req, res) => {
  const parentId = req.user.id;

  // Get classIds for this parent's children
  const classRes = await query(`
    SELECT DISTINCT s.ClassId FROM ParentStudentLinks l
    INNER JOIN Students s ON s.Id=l.StudentId
    WHERE l.ParentId=@pid AND l.Status='Active'
  `, { pid: parentId });
  const classIds = classRes.recordset.map(r => r.ClassId);

  // Build notification query
  const result = await query(`
    SELECT n.*,
      CASE WHEN nr.UserId IS NOT NULL THEN 1 ELSE 0 END AS IsRead
    FROM Notifications n
    LEFT JOIN NotificationReads nr ON nr.NotificationId=n.Id AND nr.UserId=@pid
    WHERE n.Role='parent'
      AND (n.UserId IS NULL OR n.UserId=@pid)
    ORDER BY n.SentAt DESC
  `, { pid: parentId });

  // Filter by classId in JS (since IN clause with variable list is complex in mssql)
  const notifications = result.recordset.filter(n =>
    !n.ClassId || classIds.includes(n.ClassId)
  );

  res.json(notifications);
}));

router.put('/notifications/:id/read', asyncHandler(async (req, res) => {
  const { id } = req.params;
  await query(`
    IF NOT EXISTS (SELECT 1 FROM NotificationReads WHERE NotificationId=@nid AND UserId=@uid)
      INSERT INTO NotificationReads (NotificationId, UserId, ReadAt) VALUES (@nid, @uid, @at)
  `, { nid: id, uid: req.user.id, at: Date.now() });
  res.json({ message: 'Marked as read.' });
}));

router.put('/notifications/read-all', asyncHandler(async (req, res) => {
  const parentId = req.user.id;

  const result = await query(
    `SELECT Id FROM Notifications WHERE Role='parent' AND (UserId IS NULL OR UserId=@pid)`,
    { pid: parentId }
  );

  for (const n of result.recordset) {
    await query(`
      IF NOT EXISTS (SELECT 1 FROM NotificationReads WHERE NotificationId=@nid AND UserId=@uid)
        INSERT INTO NotificationReads (NotificationId, UserId, ReadAt) VALUES (@nid, @uid, @at)
    `, { nid: n.Id, uid: parentId, at: Date.now() });
  }

  res.json({ message: 'All notifications marked as read.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// ANNOUNCEMENTS
// GET /api/parent/announcements
// ─────────────────────────────────────────────────────────────────────────────
router.get('/announcements', asyncHandler(async (req, res) => {
  const today = new Date().toISOString().slice(0, 10);
  const result = await query(`
    SELECT * FROM Announcements
    WHERE Status='Published'
      AND Audience LIKE '%Parents%'
      AND PublishDate <= @today
      AND (ExpiryDate IS NULL OR ExpiryDate >= @today)
    ORDER BY PublishDate DESC, CreatedAt DESC
  `, { today });
  res.json(result.recordset);
}));

// ─────────────────────────────────────────────────────────────────────────────
// CAMERA SCHEDULE
// GET /api/parent/cameras?classId=c1
// ─────────────────────────────────────────────────────────────────────────────
router.get('/cameras', asyncHandler(async (req, res) => {
  const parentId = req.user.id;

  // Verify parent has access
  const parent = await query('SELECT CameraAccess FROM Parents WHERE Id=@id', { id: parentId });
  if (!parent.recordset[0]?.CameraAccess) {
    throw httpError(403, 'Camera access is not enabled for your account.');
  }

  const { classId } = req.query;
  if (!classId) throw httpError(400, 'classId is required.');

  // Verify linked
  const linkCheck = await query(`
    SELECT 1 FROM ParentStudentLinks l
    INNER JOIN Students s ON s.Id=l.StudentId
    WHERE l.ParentId=@pid AND s.ClassId=@cid AND l.Status='Active'
  `, { pid: parentId, cid: classId });
  if (!linkCheck.recordset.length) throw httpError(403, 'No access to this class camera.');

  const today = new Date().toISOString().slice(0, 10);
  const [cam, schedules] = await Promise.all([
    query('SELECT * FROM Cameras WHERE ClassId=@cid', { cid: classId }),
    query(`
      SELECT * FROM CameraSchedules
      WHERE ClassId=@cid AND Enabled=1 AND Date >= @today
      ORDER BY Date ASC, StartTime ASC
    `, { cid: classId, today }),
  ]);

  res.json({
    camera: cam.recordset[0] || null,
    schedules: schedules.recordset,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// HELPERS
// ─────────────────────────────────────────────────────────────────────────────
async function assertLinked(parentId, studentId) {
  const result = await query(
    `SELECT * FROM ParentStudentLinks WHERE ParentId=@pid AND StudentId=@sid AND Status='Active'`,
    { pid: parentId, sid: studentId }
  );
  if (!result.recordset[0]) throw httpError(403, 'This student is not linked to your account.');
  return result.recordset[0];
}

function tryParseJSON(str, fallback) {
  try { return JSON.parse(str); } catch { return fallback; }
}

module.exports = router;

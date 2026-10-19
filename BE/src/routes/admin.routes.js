const express = require('express');
const bcrypt = require('bcryptjs');
const { query } = require('../database/db');
const { authenticate, authorize } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errorHandler');

const router = express.Router();

// All admin routes require authentication + admin role
router.use(authenticate, authorize('admin'));

// ─────────────────────────────────────────────────────────────────────────────
// DASHBOARD
// GET /api/admin/dashboard
// ─────────────────────────────────────────────────────────────────────────────
router.get('/dashboard', asyncHandler(async (req, res) => {
  const [schools, principals, teachers, students, parents, recentAudit] = await Promise.all([
    query('SELECT COUNT(*) AS total, SUM(CASE WHEN Status=\'Active\' THEN 1 ELSE 0 END) AS active FROM Schools'),
    query('SELECT COUNT(*) AS total FROM Principals'),
    query('SELECT COUNT(*) AS total FROM Teachers'),
    query('SELECT COUNT(*) AS total FROM Students'),
    query('SELECT COUNT(*) AS total FROM Parents'),
    query('SELECT TOP 10 * FROM AuditLogs ORDER BY CreatedAt DESC'),
  ]);

  res.json({
    schools: schools.recordset[0],
    principals: principals.recordset[0].total,
    teachers: teachers.recordset[0].total,
    students: students.recordset[0].total,
    parents: parents.recordset[0].total,
    recentActivity: recentAudit.recordset,
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// SCHOOLS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/schools', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT s.*, p.Name AS PrincipalName,
      (SELECT COUNT(*) FROM Teachers t WHERE t.SchoolId = s.Id) AS TeacherCount,
      (SELECT COUNT(*) FROM Classes  c WHERE c.SchoolId = s.Id) AS ClassCount,
      (SELECT COUNT(*) FROM Students st WHERE st.SchoolId = s.Id) AS StudentCount
    FROM Schools s
    LEFT JOIN Principals p ON p.Id = s.PrincipalId
    ORDER BY s.CreatedAt DESC
  `);
  res.json(result.recordset);
}));

router.get('/schools/:id', asyncHandler(async (req, res) => {
  const result = await query(
    `SELECT s.*, p.Name AS PrincipalName FROM Schools s LEFT JOIN Principals p ON p.Id = s.PrincipalId WHERE s.Id = @id`,
    { id: req.params.id }
  );
  if (!result.recordset[0]) throw httpError(404, 'School not found.');
  res.json(result.recordset[0]);
}));

router.post('/schools', asyncHandler(async (req, res) => {
  const { name, address, phone, email, principalId, status = 'Active' } = req.body;
  if (!name) throw httpError(400, 'School name is required.');

  const dup = await query('SELECT Id FROM Schools WHERE LOWER(Name) = LOWER(@name)', { name });
  if (dup.recordset.length) throw httpError(409, 'A school with this name already exists.');

  const id = `s_${Date.now()}`;
  await query(`
    INSERT INTO Schools (Id, Name, Address, Phone, Email, PrincipalId, Status, CreatedAt, UpdatedAt)
    VALUES (@id, @name, @address, @phone, @email, @principalId, @status, @at, @at)
  `, { id, name, address: address||'', phone: phone||'', email: email||'', principalId: principalId||null, status, at: Date.now() });

  if (principalId) {
    await query('UPDATE Principals SET SchoolId = @sid WHERE Id = @pid', { sid: id, pid: principalId });
  }

  await auditLog(req, 'Create', 'Schools', `School created: ${name}`);
  res.status(201).json({ id, message: 'School created.' });
}));

router.put('/schools/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, address, phone, email, principalId, status } = req.body;

  const exists = await query('SELECT Id, PrincipalId FROM Schools WHERE Id = @id', { id });
  if (!exists.recordset[0]) throw httpError(404, 'School not found.');
  const old = exists.recordset[0];

  if (name) {
    const dup = await query('SELECT Id FROM Schools WHERE LOWER(Name)=LOWER(@name) AND Id != @id', { name, id });
    if (dup.recordset.length) throw httpError(409, 'A school with this name already exists.');
  }

  await query(`
    UPDATE Schools SET
      Name = COALESCE(@name, Name),
      Address = COALESCE(@address, Address),
      Phone = COALESCE(@phone, Phone),
      Email = COALESCE(@email, Email),
      PrincipalId = @principalId,
      Status = COALESCE(@status, Status),
      UpdatedAt = @at
    WHERE Id = @id
  `, { name: name||null, address: address||null, phone: phone||null, email: email||null, principalId: principalId||null, status: status||null, at: Date.now(), id });

  // Sync principal's SchoolId
  if (old.PrincipalId && old.PrincipalId !== principalId) {
    await query('UPDATE Principals SET SchoolId = NULL WHERE Id = @pid', { pid: old.PrincipalId });
  }
  if (principalId) {
    await query('UPDATE Principals SET SchoolId = @sid WHERE Id = @pid', { sid: id, pid: principalId });
  }

  await auditLog(req, 'Update', 'Schools', `School updated: ${name || id}`);
  res.json({ message: 'School updated.' });
}));

router.patch('/schools/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['Active','Inactive','Locked'].includes(status)) throw httpError(400, 'Invalid status.');
  await query('UPDATE Schools SET Status=@status, UpdatedAt=@at WHERE Id=@id', { status, at: Date.now(), id: req.params.id });
  await auditLog(req, 'Update', 'Schools', `School status changed to ${status}: ${req.params.id}`);
  res.json({ message: `School status updated to ${status}.` });
}));

// ─────────────────────────────────────────────────────────────────────────────
// PRINCIPALS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/principals', asyncHandler(async (req, res) => {
  const result = await query(`
    SELECT p.Id, p.Name, p.Phone, p.Email, p.SchoolId, p.Status, p.LastLogin, p.CreatedAt,
           s.Name AS SchoolName
    FROM Principals p
    LEFT JOIN Schools s ON s.Id = p.SchoolId
    ORDER BY p.CreatedAt DESC
  `);
  res.json(result.recordset);
}));

router.post('/principals', asyncHandler(async (req, res) => {
  const { name, phone, email, schoolId, status = 'Active' } = req.body;
  if (!name || !phone) throw httpError(400, 'Name and phone are required.');

  const dup = await query('SELECT Id FROM Principals WHERE Phone = @phone', { phone });
  if (dup.recordset.length) throw httpError(409, 'This phone number is already registered.');

  const id = `pr_${Date.now()}`;
  const hash = await bcrypt.hash('123456', 10);
  await query(`
    INSERT INTO Principals (Id, Name, Phone, Email, PasswordHash, SchoolId, Status, CreatedAt, UpdatedAt)
    VALUES (@id, @name, @phone, @email, @hash, @schoolId, @status, @at, @at)
  `, { id, name, phone, email: email||'', hash, schoolId: schoolId||null, status, at: Date.now() });

  if (schoolId) {
    await query('UPDATE Schools SET PrincipalId = @pid WHERE Id = @sid', { pid: id, sid: schoolId });
  }

  await auditLog(req, 'Create', 'Principals', `Principal account created: ${name}`);
  res.status(201).json({ id, message: 'Principal created. Default password: 123456' });
}));

router.put('/principals/:id', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const { name, phone, email, schoolId, status } = req.body;

  const exists = await query('SELECT Id, SchoolId FROM Principals WHERE Id = @id', { id });
  if (!exists.recordset[0]) throw httpError(404, 'Principal not found.');
  const old = exists.recordset[0];

  if (phone) {
    const dup = await query('SELECT Id FROM Principals WHERE Phone=@phone AND Id!=@id', { phone, id });
    if (dup.recordset.length) throw httpError(409, 'Phone number already in use.');
  }

  await query(`
    UPDATE Principals SET
      Name = COALESCE(@name, Name),
      Phone = COALESCE(@phone, Phone),
      Email = COALESCE(@email, Email),
      SchoolId = @schoolId,
      Status = COALESCE(@status, Status),
      UpdatedAt = @at
    WHERE Id = @id
  `, { name: name||null, phone: phone||null, email: email||null, schoolId: schoolId||null, status: status||null, at: Date.now(), id });

  // Sync school's PrincipalId
  if (old.SchoolId && old.SchoolId !== schoolId) {
    await query('UPDATE Schools SET PrincipalId = NULL WHERE Id = @sid AND PrincipalId = @pid', { sid: old.SchoolId, pid: id });
  }
  if (schoolId) {
    await query('UPDATE Schools SET PrincipalId = @pid WHERE Id = @sid', { pid: id, sid: schoolId });
  }

  await auditLog(req, 'Update', 'Principals', `Principal updated: ${name || id}`);
  res.json({ message: 'Principal updated.' });
}));

router.patch('/principals/:id/status', asyncHandler(async (req, res) => {
  const { status } = req.body;
  if (!['Active','Inactive','Locked'].includes(status)) throw httpError(400, 'Invalid status.');
  await query('UPDATE Principals SET Status=@status, UpdatedAt=@at WHERE Id=@id', { status, at: Date.now(), id: req.params.id });
  await auditLog(req, 'Update', 'Principals', `Principal status changed to ${status}: ${req.params.id}`);
  res.json({ message: `Principal status updated to ${status}.` });
}));

router.post('/principals/:id/reset-password', asyncHandler(async (req, res) => {
  const { id } = req.params;
  const hash = await bcrypt.hash('123456', 10);
  await query('UPDATE Principals SET PasswordHash=@hash, UpdatedAt=@at WHERE Id=@id', { hash, at: Date.now(), id });
  await auditLog(req, 'Reset Password', 'Principals', `Password reset for principal: ${id}`);
  res.json({ message: 'Password reset to 123456.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM SETTINGS
// ─────────────────────────────────────────────────────────────────────────────
router.get('/settings', asyncHandler(async (req, res) => {
  const result = await query('SELECT SettingKey, SettingValue FROM SystemSettings');
  const settings = {};
  result.recordset.forEach(r => { settings[r.SettingKey] = r.SettingValue; });
  res.json(settings);
}));

router.put('/settings', asyncHandler(async (req, res) => {
  const entries = Object.entries(req.body);
  for (const [key, value] of entries) {
    await query(`
      IF EXISTS (SELECT 1 FROM SystemSettings WHERE SettingKey=@key)
        UPDATE SystemSettings SET SettingValue=@val, UpdatedAt=@at WHERE SettingKey=@key
      ELSE
        INSERT INTO SystemSettings (SettingKey, SettingValue, UpdatedAt) VALUES (@key, @val, @at)
    `, { key, val: String(value), at: Date.now() });
  }
  await auditLog(req, 'Update', 'System Settings', 'Global settings updated');
  res.json({ message: 'Settings saved.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// AUDIT LOGS
// GET /api/admin/audit?limit=50&offset=0
// ─────────────────────────────────────────────────────────────────────────────
router.get('/audit', asyncHandler(async (req, res) => {
  const limit = parseInt(req.query.limit) || 50;
  const offset = parseInt(req.query.offset) || 0;
  const result = await query(
    `SELECT * FROM AuditLogs ORDER BY CreatedAt DESC OFFSET @offset ROWS FETCH NEXT @limit ROWS ONLY`,
    { offset, limit }
  );
  const total = await query('SELECT COUNT(*) AS cnt FROM AuditLogs');
  res.json({ data: result.recordset, total: total.recordset[0].cnt });
}));

// ─────────────────────────────────────────────────────────────────────────────
// SYSTEM MONITORING (mock metrics)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/monitoring', asyncHandler(async (req, res) => {
  // Real db stats
  const dbResult = await query(`
    SELECT
      (SELECT COUNT(*) FROM Schools)   AS schools,
      (SELECT COUNT(*) FROM Teachers)  AS teachers,
      (SELECT COUNT(*) FROM Students)  AS students,
      (SELECT COUNT(*) FROM Parents)   AS parents,
      (SELECT COUNT(*) FROM AuditLogs) AS auditEvents
  `);
  res.json({
    services: [
      { name: 'Web application',        status: 'Operational', detail: 'Response time 182 ms' },
      { name: 'Database (SQL Server)',   status: 'Operational', detail: '14 of 100 connections in use' },
      { name: 'File storage',           status: 'Operational', detail: 'Photos and attachments' },
      { name: 'Notification service',   status: 'Operational', detail: 'Queue empty' },
    ],
    resources: {
      storage: { used: 38.4, total: 100, unit: 'GB' },
      cpu: { percent: 23 },
      memory: { usedGb: 4.3, totalGb: 8 },
    },
    dbStats: dbResult.recordset[0],
    checkedAt: Date.now(),
  });
}));

// ─────────────────────────────────────────────────────────────────────────────
// PROFILE (admin own profile)
// ─────────────────────────────────────────────────────────────────────────────
router.get('/profile', asyncHandler(async (req, res) => {
  const result = await query('SELECT Id, Name, Phone, Email, Status, LastLogin FROM Admins WHERE Id = @id', { id: req.user.id });
  if (!result.recordset[0]) throw httpError(404, 'Profile not found.');
  res.json(result.recordset[0]);
}));

router.put('/profile', asyncHandler(async (req, res) => {
  const { name, email } = req.body;
  await query(
    'UPDATE Admins SET Name=COALESCE(@name,Name), Email=COALESCE(@email,Email), UpdatedAt=@at WHERE Id=@id',
    { name: name||null, email: email||null, at: Date.now(), id: req.user.id }
  );
  res.json({ message: 'Profile updated.' });
}));

// ─────────────────────────────────────────────────────────────────────────────
// Helper: insert audit log from admin context
// ─────────────────────────────────────────────────────────────────────────────
async function auditLog(req, action, module, description) {
  await query(`
    INSERT INTO AuditLogs (Id, UserId, UserName, UserRole, Action, Module, Description, Status, CreatedAt)
    VALUES (NEWID(), @uid, @uname, 'System Admin', @action, @module, @desc, 'Success', @at)
  `, { uid: req.user.id, uname: req.user.name, action, module, desc: description, at: Date.now() });
}

module.exports = router;

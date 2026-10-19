const express = require('express');
const bcrypt = require('bcryptjs');
const { query, sql } = require('../database/db');
const { generateToken, authenticate } = require('../middleware/auth');
const { asyncHandler, httpError } = require('../middleware/errorHandler');

const router = express.Router();

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/auth/login
// Body: { role, phone, password }
// ─────────────────────────────────────────────────────────────────────────────
router.post('/login', asyncHandler(async (req, res) => {
  const { role, phone, password } = req.body;

  if (!role || !phone || !password) {
    throw httpError(400, 'role, phone and password are required.');
  }

  const ROLE_TABLE = {
    admin:     'Admins',
    principal: 'Principals',
    teacher:   'Teachers',
    parent:    'Parents',
  };

  const table = ROLE_TABLE[role];
  if (!table) throw httpError(400, `Invalid role: ${role}`);

  const result = await query(
    `SELECT * FROM [${table}] WHERE Phone = @phone`,
    { phone: phone.trim() }
  );

  const user = result.recordset[0];
  if (!user) {
    throw httpError(401, 'Incorrect phone number or password.');
  }

  const passwordMatch = await bcrypt.compare(password, user.PasswordHash);
  if (!passwordMatch) {
    // Log failed login attempt
    await query(`
      INSERT INTO AuditLogs (Id, UserId, UserName, UserRole, Action, Module, Description, Status, CreatedAt)
      VALUES (NEWID(), @uid, @uname, @urole, 'Login', 'Authentication', @desc, 'Failed', @at)
    `, {
      uid: user.Id, uname: user.Name,
      urole: role.charAt(0).toUpperCase() + role.slice(1),
      desc: `Failed login attempt for phone: ${phone}`,
      at: Date.now(),
    });
    throw httpError(401, 'Incorrect phone number or password.');
  }

  if (user.Status !== 'Active') {
    throw httpError(403, `This account is ${user.Status.toLowerCase()}. Please contact your school.`);
  }

  // Update last login
  await query(
    `UPDATE [${table}] SET LastLogin = @now WHERE Id = @id`,
    { now: Date.now(), id: user.Id }
  );

  const token = generateToken({ id: user.Id, role, name: user.Name });

  // Audit log: successful login
  await query(`
    INSERT INTO AuditLogs (Id, UserId, UserName, UserRole, Action, Module, Description, Status, CreatedAt)
    VALUES (NEWID(), @uid, @uname, @urole, 'Login', 'Authentication', @desc, 'Success', @at)
  `, {
    uid: user.Id, uname: user.Name,
    urole: role.charAt(0).toUpperCase() + role.slice(1),
    desc: `Signed in successfully`,
    at: Date.now(),
  });

  const { PasswordHash, ...safeUser } = user;
  res.json({ token, role, user: { ...safeUser, role } });
}));

// ─────────────────────────────────────────────────────────────────────────────
// GET /api/auth/me – return current user info
// ─────────────────────────────────────────────────────────────────────────────
router.get('/me', authenticate, asyncHandler(async (req, res) => {
  const { id, role } = req.user;

  const ROLE_TABLE = {
    admin: 'Admins', principal: 'Principals', teacher: 'Teachers', parent: 'Parents',
  };
  const table = ROLE_TABLE[role];
  const result = await query(`SELECT * FROM [${table}] WHERE Id = @id`, { id });
  const user = result.recordset[0];
  if (!user) throw httpError(404, 'User not found.');

  const { PasswordHash, ...safeUser } = user;
  res.json({ ...safeUser, role });
}));

// ─────────────────────────────────────────────────────────────────────────────
// PUT /api/auth/change-password
// Body: { currentPassword, newPassword }
// ─────────────────────────────────────────────────────────────────────────────
router.put('/change-password', authenticate, asyncHandler(async (req, res) => {
  const { currentPassword, newPassword } = req.body;
  const { id, role } = req.user;

  if (!currentPassword || !newPassword) {
    throw httpError(400, 'currentPassword and newPassword are required.');
  }
  if (newPassword.length < 6) {
    throw httpError(400, 'New password must be at least 6 characters.');
  }

  const ROLE_TABLE = { admin:'Admins', principal:'Principals', teacher:'Teachers', parent:'Parents' };
  const table = ROLE_TABLE[role];

  const result = await query(`SELECT PasswordHash FROM [${table}] WHERE Id = @id`, { id });
  const user = result.recordset[0];
  if (!user) throw httpError(404, 'User not found.');

  const match = await bcrypt.compare(currentPassword, user.PasswordHash);
  if (!match) throw httpError(401, 'Current password is incorrect.');

  const newHash = await bcrypt.hash(newPassword, 10);
  await query(
    `UPDATE [${table}] SET PasswordHash = @hash, UpdatedAt = @at WHERE Id = @id`,
    { hash: newHash, at: Date.now(), id }
  );

  res.json({ message: 'Password changed successfully.' });
}));

module.exports = router;

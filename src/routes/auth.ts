import { Router, Request, Response } from 'express';
import bcrypt from 'bcryptjs';
import jwt from 'jsonwebtoken';
import { v4 as uuidv4 } from 'uuid';
import db from '../db/database.js';
import config from '../config/index.js';
import { authenticate } from '../middleware/auth.js';
import type { User } from '../types/index.js';

const router = Router();

/**
 * POST /api/auth/login
 * Authenticate user and return JWT token
 */
router.post('/login', (req: Request, res: Response) => {
  const { email, password } = req.body;

  if (!email || !password) {
    res.status(400).json({ success: false, error: 'Email and password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE email = ?').get(email) as User | undefined;

  if (!user) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    return;
  }

  const validPassword = bcrypt.compareSync(password, user.password_hash || '');

  if (!validPassword) {
    res.status(401).json({ success: false, error: 'Invalid credentials' });
    return;
  }

  const token = jwt.sign(
    { id: user.id, email: user.email, name: user.name, role: user.role },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  res.json({
    success: true,
    data: {
      token,
      user: {
        id: user.id,
        email: user.email,
        name: user.name,
        role: user.role,
      },
    },
  });
});

/**
 * POST /api/auth/register
 * Register a new user (admin only in production)
 */
router.post('/register', (req: Request, res: Response) => {
  const { email, password, name, role } = req.body;

  if (!email || !password || !name) {
    res.status(400).json({ success: false, error: 'Email, password, and name are required' });
    return;
  }

  const existingUser = db.prepare('SELECT id FROM users WHERE email = ?').get(email);

  if (existingUser) {
    res.status(400).json({ success: false, error: 'Email already registered' });
    return;
  }

  const id = uuidv4();
  const passwordHash = bcrypt.hashSync(password, 10);
  const userRole = role || 'sales_rep';

  db.prepare(`
    INSERT INTO users (id, email, password_hash, name, role)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, email, passwordHash, name, userRole);

  const token = jwt.sign(
    { id, email, name, role: userRole },
    config.jwtSecret,
    { expiresIn: '24h' }
  );

  res.status(201).json({
    success: true,
    data: {
      token,
      user: { id, email, name, role: userRole },
    },
  });
});

/**
 * GET /api/auth/me
 * Get current user info
 */
router.get('/me', authenticate, (req: Request, res: Response) => {
  res.json({
    success: true,
    data: req.user,
  });
});

/**
 * POST /api/auth/change-password
 * Change user password
 */
router.post('/change-password', authenticate, (req: Request, res: Response) => {
  const { currentPassword, newPassword } = req.body;

  if (!currentPassword || !newPassword) {
    res.status(400).json({ success: false, error: 'Current and new password are required' });
    return;
  }

  const user = db.prepare('SELECT * FROM users WHERE id = ?').get(req.user!.id) as User;

  const validPassword = bcrypt.compareSync(currentPassword, user.password_hash || '');

  if (!validPassword) {
    res.status(401).json({ success: false, error: 'Current password is incorrect' });
    return;
  }

  const newHash = bcrypt.hashSync(newPassword, 10);

  db.prepare('UPDATE users SET password_hash = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(
    newHash,
    req.user!.id
  );

  res.json({ success: true, message: 'Password updated successfully' });
});

export default router;

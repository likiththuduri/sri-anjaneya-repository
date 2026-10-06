import jwt from 'jsonwebtoken';
import bcrypt from 'bcryptjs';
import dotenv from 'dotenv';
import { adminRepo } from './database.js';

dotenv.config();

const JWT_SECRET = process.env.JWT_SECRET || 'sri_anjaneya_secure_jwt_secret_key_2026_change_in_production';
const JWT_EXPIRES_IN = '7d';

export async function hashPassword(plainPassword) {
  const salt = await bcrypt.genSalt(10);
  return bcrypt.hash(plainPassword, salt);
}

export async function comparePassword(plainPassword, passwordHash) {
  return bcrypt.compare(plainPassword, passwordHash);
}

export function generateToken(admin) {
  return jwt.sign(
    {
      sub: admin.id,
      username: admin.username,
      role: admin.role || 'admin'
    },
    JWT_SECRET,
    { expiresIn: JWT_EXPIRES_IN }
  );
}

export function requireAdmin(req, res, next) {
  const authHeader = req.headers.authorization || '';
  if (!authHeader.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Authentication required. Please log in as admin.' });
  }

  const token = authHeader.slice(7).trim();
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    const admin = adminRepo.getById(decoded.sub);
    if (!admin) {
      return res.status(401).json({ error: 'Admin account not found or deactivated.' });
    }
    req.admin = admin;
    next();
  } catch (err) {
    return res.status(401).json({ error: 'Session expired or invalid token. Please log in again.' });
  }
}

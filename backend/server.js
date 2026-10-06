import express from 'express';
import cors from 'cors';
import dotenv from 'dotenv';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import multer from 'multer';

import { productRepo, settingsRepo, orderRepo, adminRepo } from './database.js';
import { hashPassword, comparePassword, generateToken, requireAdmin } from './auth.js';
import { runSeed } from './seed.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const PORT = Number(process.env.PORT || 4000);
const HOST = process.env.HOST || '0.0.0.0';
const CORS_ORIGIN = process.env.CORS_ORIGIN || '*';
const uploadsDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

const app = express();

// Middleware
app.use(cors({
  origin: CORS_ORIGIN === '*' ? true : CORS_ORIGIN,
  credentials: true
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Static file serving for uploads with cache control and ETags
app.use('/uploads', (req, res, next) => {
  res.setHeader('Cache-Control', 'public, max-age=3600, must-revalidate');
  next();
}, express.static(uploadsDir));

// Serve frontend directly if present in parent directory (allows all-in-one local running & testing)
const parentDir = path.join(__dirname, '..');
const frontendDir = path.join(__dirname, '../frontend');
if (fs.existsSync(path.join(parentDir, 'index.html'))) {
  app.use(express.static(parentDir));
} else if (fs.existsSync(frontendDir)) {
  app.use(express.static(frontendDir));
}


// Multer Storage Configuration for Image Uploads
const storage = multer.diskStorage({
  destination: (_req, _file, cb) => {
    cb(null, uploadsDir);
  },
  filename: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase() || '.jpg';
    const cleanPrefix = (req.query.type || 'img').replace(/[^a-zA-Z0-9_-]/g, '');
    const filename = `${cleanPrefix}-${Date.now()}-${Math.round(Math.random() * 1e6)}${ext}`;
    cb(null, filename);
  }
});

const fileFilter = (_req, file, cb) => {
  const allowedMimes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif', 'image/svg+xml'];
  if (allowedMimes.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error('Only image files (JPEG, PNG, WebP, GIF, SVG) are allowed.'));
  }
};

const upload = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15 MB
  fileFilter
});

/* ========================================================
   API ROUTES
======================================================== */

// 1. Health Check
app.get('/api/health', (_req, res) => {
  res.json({
    status: 'ok',
    service: 'Sri Anjaneya Online Backend',
    time: new Date().toISOString()
  });
});

// 2. Authentication Routes
app.post('/api/auth/login', async (req, res) => {
  try {
    const { username, password } = req.body || {};
    if (!username || !password) {
      return res.status(400).json({ error: 'Username and password are required.' });
    }

    const admin = adminRepo.getByUsername(username.trim());
    if (!admin) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const matches = await comparePassword(password, admin.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Invalid username or password.' });
    }

    const token = generateToken(admin);
    res.json({
      token,
      user: {
        id: admin.id,
        username: admin.username,
        role: admin.role
      }
    });
  } catch (err) {
    console.error('Login error:', err);
    res.status(500).json({ error: 'An error occurred during login.' });
  }
});

app.get('/api/auth/me', requireAdmin, (req, res) => {
  res.json({
    user: {
      id: req.admin.id,
      username: req.admin.username,
      role: req.admin.role,
      createdAt: req.admin.createdAt
    }
  });
});

app.put('/api/auth/profile', requireAdmin, async (req, res) => {
  try {
    const { currentPassword, newUsername, newPassword } = req.body || {};
    if (!currentPassword) {
      return res.status(400).json({ error: 'Current password is required to make profile changes.' });
    }

    const admin = adminRepo.getByUsername(req.admin.username);
    const matches = await comparePassword(currentPassword, admin.passwordHash);
    if (!matches) {
      return res.status(401).json({ error: 'Incorrect current password.' });
    }

    let hashedNewPassword = null;
    if (newPassword && newPassword.trim().length > 0) {
      if (newPassword.trim().length < 6) {
        return res.status(400).json({ error: 'New password must be at least 6 characters long.' });
      }
      hashedNewPassword = await hashPassword(newPassword.trim());
    }

    const updated = adminRepo.updateCredentials(
      req.admin.id,
      newUsername ? newUsername.trim() : null,
      hashedNewPassword
    );

    res.json({
      message: 'Credentials updated successfully.',
      user: {
        id: updated.id,
        username: updated.username,
        role: updated.role
      }
    });
  } catch (err) {
    console.error('Profile update error:', err);
    res.status(500).json({ error: err.message || 'Failed to update credentials.' });
  }
});

app.post('/api/auth/logout', (_req, res) => {
  res.json({ ok: true, message: 'Logged out successfully.' });
});

// 3. Product Routes
app.get('/api/products', (_req, res) => {
  try {
    const products = productRepo.getAll();
    res.json(products);
  } catch (err) {
    console.error('Get products error:', err);
    res.status(500).json({ error: 'Failed to retrieve products.' });
  }
});

app.get('/api/products/:id', (req, res) => {
  try {
    const product = productRepo.getById(req.params.id);
    if (!product) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json(product);
  } catch (err) {
    console.error('Get product error:', err);
    res.status(500).json({ error: 'Failed to retrieve product.' });
  }
});

app.post('/api/products', requireAdmin, (req, res) => {
  try {
    const data = req.body;
    if (!data.name || !data.name.trim()) {
      return res.status(400).json({ error: 'Product name is required.' });
    }
    const created = productRepo.create(data);
    res.status(201).json(created);
  } catch (err) {
    console.error('Create product error:', err);
    res.status(500).json({ error: err.message || 'Failed to create product.' });
  }
});

app.put('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const updated = productRepo.update(req.params.id, req.body);
    if (!updated) {
      return res.status(404).json({ error: 'Product not found.' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Update product error:', err);
    res.status(500).json({ error: err.message || 'Failed to update product.' });
  }
});

app.delete('/api/products/:id', requireAdmin, (req, res) => {
  try {
    const success = productRepo.delete(req.params.id);
    if (!success) {
      return res.status(404).json({ error: 'Product not found or already deleted.' });
    }
    res.json({ ok: true, message: 'Product deleted successfully.' });
  } catch (err) {
    console.error('Delete product error:', err);
    res.status(500).json({ error: 'Failed to delete product.' });
  }
});

// 4. Shop Settings Routes
app.get('/api/settings', (_req, res) => {
  try {
    const settings = settingsRepo.get() || {};
    res.json(settings);
  } catch (err) {
    console.error('Get settings error:', err);
    res.status(500).json({ error: 'Failed to retrieve shop settings.' });
  }
});

app.put('/api/settings', requireAdmin, (req, res) => {
  try {
    const updated = settingsRepo.upsert(req.body);
    res.json(updated);
  } catch (err) {
    console.error('Update settings error:', err);
    res.status(500).json({ error: 'Failed to update shop settings.' });
  }
});

// 5. Image Upload Route
app.post('/api/upload', requireAdmin, upload.single('file'), (req, res) => {
  if (!req.file) {
    return res.status(400).json({ error: 'No image file uploaded.' });
  }

  // Return clean URL with cache-busting timestamp
  const relativeUrl = `/uploads/${req.file.filename}`;
  res.status(201).json({
    url: relativeUrl,
    filename: req.file.filename,
    size: req.file.size,
    mimetype: req.file.mimetype
  });
});

// 6. Orders Routes
app.get('/api/orders', requireAdmin, (_req, res) => {
  try {
    const orders = orderRepo.getAll();
    res.json(orders);
  } catch (err) {
    console.error('Get orders error:', err);
    res.status(500).json({ error: 'Failed to retrieve orders.' });
  }
});

app.get('/api/orders/:id', requireAdmin, (req, res) => {
  try {
    const order = orderRepo.getById(req.params.id);
    if (!order) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    res.json(order);
  } catch (err) {
    console.error('Get order error:', err);
    res.status(500).json({ error: 'Failed to retrieve order.' });
  }
});

app.post('/api/orders', (req, res) => {
  try {
    const order = orderRepo.createWithAtomicStockDeduction(req.body);
    res.status(201).json(order);
  } catch (err) {
    console.error('Order creation error:', err);
    res.status(400).json({ error: err.message || 'Failed to place order.' });
  }
});

app.delete('/api/orders/:id', requireAdmin, (req, res) => {  try {
    const { status } = req.body || {};
    if (!status) {
      return res.status(400).json({ error: 'Order status is required.' });
    }
    const updated = orderRepo.updateStatus(req.params.id, status);
    if (!updated) {
      return res.status(404).json({ error: 'Order not found.' });
    }
    res.json(updated);
  } catch (err) {
    console.error('Update order status error:', err);
    res.status(500).json({ error: 'Failed to update order status.' });
  }
});

// 7. Migration Endpoint (Optional One-time LocalStorage Sync)
app.post('/api/migrate-local', requireAdmin, (req, res) => {
  try {
    const { products, settings } = req.body || {};
    let migratedProds = 0;

    if (Array.isArray(products)) {
      for (const p of products) {
        if (!p.id || !p.name) continue;
        const exists = productRepo.getById(p.id);
        if (!exists) {
          productRepo.create(p);
          migratedProds++;
        }
      }
    }

    if (settings && typeof settings === 'object') {
      settingsRepo.upsert(settings);
    }

    res.json({
      message: `Migration completed. Migrated ${migratedProds} new products and updated settings.`,
      migratedCount: migratedProds
    });
  } catch (err) {
    console.error('Migration error:', err);
    res.status(500).json({ error: err.message || 'Migration failed.' });
  }
});

// Error handling middleware for Multer and general errors
app.use((err, _req, res, _next) => {
  console.error('Server error:', err);
  if (err instanceof multer.MulterError) {
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }
  res.status(500).json({ error: err.message || 'Internal Server Error' });
});

/* ========================================================
   SERVER STARTUP
======================================================== */
async function start() {
  try {
    // Run seed/check
    await runSeed();

    app.listen(PORT, HOST, () => {
      console.log(`
===========================================================
🌾 Sri Anjaneya Fertilizers, Pesticides and Seeds Backend
===========================================================
🚀 Server running at:
   - Local:   http://localhost:${PORT}
   - Network: http://${HOST}:${PORT}
   - API:     http://localhost:${PORT}/api
   - Uploads: http://localhost:${PORT}/uploads
===========================================================
      `);
    });
  } catch (err) {
    console.error('Failed to start server:', err);
    process.exit(1);
  }
}

start();

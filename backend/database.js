import { DatabaseSync } from 'node:sqlite';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbFile = process.env.DATABASE_FILE || 'sri_anjaneya.db';
const dbPath = path.isAbsolute(dbFile) ? dbFile : path.join(__dirname, dbFile);

const db = new DatabaseSync(dbPath);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');

// Schema initialization
export function initSchema() {
  db.exec(`
    CREATE TABLE IF NOT EXISTS products (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      category TEXT NOT NULL,
      brand TEXT NOT NULL,
      pack TEXT NOT NULL,
      price REAL NOT NULL,
      rating REAL DEFAULT 4.5,
      stock INTEGER NOT NULL DEFAULT 0,
      description TEXT,
      imageUrl TEXT,
      bookable INTEGER NOT NULL DEFAULT 0,
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS settings (
      id INTEGER PRIMARY KEY,
      shopName TEXT NOT NULL,
      phone TEXT NOT NULL,
      whatsapp TEXT NOT NULL,
      address TEXT NOT NULL,
      mapLink TEXT,
      mapEmbed TEXT,
      upiId TEXT,
      heroImageUrl TEXT,
      logoUrl TEXT,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS orders (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      mobile TEXT NOT NULL,
      village TEXT NOT NULL,
      payment TEXT NOT NULL,
      items TEXT NOT NULL,
      total REAL NOT NULL,
      status TEXT NOT NULL DEFAULT 'Pending',
      createdAt TEXT NOT NULL,
      updatedAt TEXT NOT NULL
    );

    CREATE TABLE IF NOT EXISTS order_seq (
      id INTEGER PRIMARY KEY,
      lastSeq INTEGER NOT NULL
    );

    CREATE TABLE IF NOT EXISTS admins (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      username TEXT UNIQUE NOT NULL,
      passwordHash TEXT NOT NULL,
      role TEXT NOT NULL DEFAULT 'admin',
      createdAt TEXT NOT NULL
    );
  `);
}

initSchema();

// Product queries
export const productRepo = {
  getAll: () => {
    const rows = db.prepare('SELECT * FROM products ORDER BY rowid ASC').all();

    return rows.map(r => ({
      ...r,
      desc: r.description || '',
      image: r.imageUrl || '',
      bookable: Boolean(r.bookable),
      price: Number(r.price),
      stock: Number(r.stock),
      rating: Number(r.rating)
    }));
  },

  getById: (id) => {
    const r = db.prepare(
      'SELECT * FROM products WHERE id = ?'
    ).get(String(id));

    if (!r) return null;

    return {
      ...r,
      image: r.imageUrl || '',
      bookable: Boolean(r.bookable),
      price: Number(r.price),
      stock: Number(r.stock),
      rating: Number(r.rating)
    };
  },

  create: (p) => {
    const now = new Date().toISOString();
    const id = String(p.id || Date.now());

    const stmt = db.prepare(`
      INSERT INTO products
      (id, name, category, brand, pack, price, rating, stock, description, imageUrl, bookable, createdAt, updatedAt)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      p.name || '',
      p.category || 'Fertilizers',
      p.brand || '',
      p.pack || '',
      Number(p.price) || 0,
      Number(p.rating) || 4.5,
      Math.max(0, Number(p.stock) || 0),
      p.desc || p.description || '',
      p.image || p.imageUrl || '',
      p.bookable ? 1 : 0,
      now,
      now
    );

    return productRepo.getById(id);
  },

  update: (id, p) => {
    const existing = productRepo.getById(id);

    if (!existing) return null;

    const now = new Date().toISOString();

    const stmt = db.prepare(`
      UPDATE products
      SET
        name = ?,
        category = ?,
        brand = ?,
        pack = ?,
        price = ?,
        rating = ?,
        stock = ?,
        description = ?,
        imageUrl = ?,
        bookable = ?,
        updatedAt = ?
      WHERE id = ?
    `);

    stmt.run(
      p.name !== undefined ? p.name : existing.name,
      p.category !== undefined ? p.category : existing.category,
      p.brand !== undefined ? p.brand : existing.brand,
      p.pack !== undefined ? p.pack : existing.pack,
      p.price !== undefined ? Number(p.price) : existing.price,
      p.rating !== undefined ? Number(p.rating) : existing.rating,
      p.stock !== undefined
        ? Math.max(0, Number(p.stock))
        : existing.stock,
      p.desc !== undefined
        ? p.desc
        : (p.description !== undefined
          ? p.description
          : existing.description),
      p.image !== undefined
        ? p.image
        : (p.imageUrl !== undefined
          ? p.imageUrl
          : existing.imageUrl),
      p.bookable !== undefined
        ? (p.bookable ? 1 : 0)
        : (existing.bookable ? 1 : 0),
      now,
      String(id)
    );

    return productRepo.getById(id);
  },

  delete: (id) => {
    const stmt = db.prepare(
      'DELETE FROM products WHERE id = ?'
    );

    const info = stmt.run(String(id));

    return info.changes > 0;
  }
};


// Settings queries
export const settingsRepo = {
  get: () => {
    const row = db.prepare(
      'SELECT * FROM settings WHERE id = 1'
    ).get();

    if (!row) return null;

    return {
      shopName: row.shopName,
      phone: row.phone,
      whatsapp: row.whatsapp,
      address: row.address,
      mapLink: row.mapLink || '',
      mapEmbed: row.mapEmbed || '',
      upiId: row.upiId || '',
      heroImage: row.heroImageUrl || '',
      logo: row.logoUrl || '',
      updatedAt: row.updatedAt
    };
  },

  upsert: (s) => {
    const existing = settingsRepo.get() || {};
    const now = new Date().toISOString();

    const current = {
      shopName:
        s.shopName !== undefined
          ? s.shopName
          : (existing.shopName ||
            'Sri Anjaneya Fertilizers, Pesticides and Seeds'),

      phone:
        s.phone !== undefined
          ? s.phone
          : (existing.phone || '917095891270'),

      whatsapp:
        s.whatsapp !== undefined
          ? s.whatsapp
          : (existing.whatsapp || '917095891270'),

      address:
        s.address !== undefined
          ? s.address
          : (existing.address || ''),

      mapLink:
        s.mapLink !== undefined
          ? s.mapLink
          : (existing.mapLink || ''),

      mapEmbed:
        s.mapEmbed !== undefined
          ? s.mapEmbed
          : (existing.mapEmbed || ''),

      upiId:
        s.upiId !== undefined
          ? s.upiId
          : (existing.upiId || ''),

      heroImageUrl:
        s.heroImage !== undefined
          ? s.heroImage
          : (
            s.heroImageUrl !== undefined
              ? s.heroImageUrl
              : (existing.heroImage || '')
          ),

      logoUrl:
        s.logo !== undefined
          ? s.logo
          : (
            s.logoUrl !== undefined
              ? s.logoUrl
              : (existing.logo || '')
          )
    };

    // First check if row with id=1 exists
    const row = db.prepare(
      'SELECT id FROM settings WHERE id = 1'
    ).get();

    if (row) {
      db.prepare(`
        UPDATE settings
        SET
          shopName = ?,
          phone = ?,
          whatsapp = ?,
          address = ?,
          mapLink = ?,
          mapEmbed = ?,
          upiId = ?,
          heroImageUrl = ?,
          logoUrl = ?,
          updatedAt = ?
        WHERE id = 1
      `).run(
        current.shopName,
        current.phone,
        current.whatsapp,
        current.address,
        current.mapLink,
        current.mapEmbed,
        current.upiId,
        current.heroImageUrl,
        current.logoUrl,
        now
      );

    } else {
      db.prepare(`
        INSERT INTO settings
        (id, shopName, phone, whatsapp, address, mapLink, mapEmbed, upiId, heroImageUrl, logoUrl, updatedAt)
        VALUES (1, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        current.shopName,
        current.phone,
        current.whatsapp,
        current.address,
        current.mapLink,
        current.mapEmbed,
        current.upiId,
        current.heroImageUrl,
        current.logoUrl,
        now
      );
    }

    return settingsRepo.get();
  }
};


// Order queries & atomic checkout transaction
export const orderRepo = {

  getAll: () => {
    const rows = db.prepare(
      'SELECT * FROM orders ORDER BY rowid DESC'
    ).all();

    return rows.map(r => ({
      ...r,
      items: JSON.parse(r.items || '[]'),
      dt: r.createdAt
    }));
  },

  getById: (id) => {
    const r = db.prepare(
      'SELECT * FROM orders WHERE id = ?'
    ).get(String(id));

    if (!r) return null;

    return {
      ...r,
      items: JSON.parse(r.items || '[]'),
      dt: r.createdAt
    };
  },

  // Atomic order creation with stock deduction
  createWithAtomicStockDeduction: (orderData) => {

    const {
      name,
      mobile,
      village,
      payment,
      items
    } = orderData;

    if (
      !name ||
      !mobile ||
      !village ||
      !Array.isArray(items) ||
      items.length === 0
    ) {
      throw new Error('Invalid order details provided');
    }

    db.exec('BEGIN IMMEDIATE;');

    try {

      // Get next Order ID
      let seqRow = db.prepare(
        'SELECT lastSeq FROM order_seq WHERE id = 1'
      ).get();

      if (!seqRow) {
        db.prepare(
          'INSERT INTO order_seq (id, lastSeq) VALUES (1, 1000)'
        ).run();

        seqRow = {
          lastSeq: 1000
        };
      }

      const nextSeq =
        Number(seqRow.lastSeq) + 1;

      db.prepare(
        'UPDATE order_seq SET lastSeq = ? WHERE id = 1'
      ).run(nextSeq);

      const orderId = `#${nextSeq}`;

      // Validate and adjust stock
      const processedItems = [];
      let total = 0;

      for (const item of items) {

        const prod = db.prepare(
          'SELECT * FROM products WHERE id = ?'
        ).get(String(item.productId));

        if (!prod) {
          throw new Error(
            `Product "${item.name || item.productId}" was not found.`
          );
        }

        const qty =
          Number(item.qty) || 1;

        const mode =
          item.mode || 'order';

        if (mode === 'order') {

          if (prod.stock < qty) {
            throw new Error(
              `Insufficient stock for "${prod.name}". Available: ${prod.stock}, Requested: ${qty}`
            );
          }

          // Decrement stock
          db.prepare(
            'UPDATE products SET stock = stock - ?, updatedAt = ? WHERE id = ?'
          ).run(
            qty,
            new Date().toISOString(),
            prod.id
          );

          const subtotal =
            Number(prod.price) * qty;

          total += subtotal;

          processedItems.push({
            productId: prod.id,
            name: prod.name,
            pack: prod.pack,
            price: Number(prod.price),
            qty,
            subtotal,
            mode: 'order'
          });

        } else {

          // Booking item - no stock deduction
          processedItems.push({
            productId: prod.id,
            name: prod.name,
            pack: prod.pack,
            price: Number(prod.price),
            qty,
            subtotal: 0,
            mode: 'book'
          });
        }
      }

      const now =
        new Date().toLocaleString('en-IN');

      const stmt = db.prepare(`
        INSERT INTO orders
        (id, name, mobile, village, payment, items, total, status, createdAt, updatedAt)
        VALUES (?, ?, ?, ?, ?, ?, ?, 'Pending', ?, ?)
      `);

      stmt.run(
        orderId,
        name,
        mobile,
        village,
        payment || 'Cash on Collection',
        JSON.stringify(processedItems),
        total,
        now,
        now
      );

      db.exec('COMMIT;');

      return {
        id: orderId,
        name,
        mobile,
        village,
        payment:
          payment || 'Cash on Collection',
        items: processedItems,
        total,
        status: 'Pending',
        dt: now,
        createdAt: now,
        updatedAt: now
      };

    } catch (err) {

      db.exec('ROLLBACK;');

      throw err;
    }
  },

  // Update order status
  updateStatus: (id, status) => {

    const now =
      new Date().toLocaleString('en-IN');

    const stmt = db.prepare(
      'UPDATE orders SET status = ?, updatedAt = ? WHERE id = ?'
    );

    stmt.run(
      status,
      now,
      String(id)
    );

    return orderRepo.getById(id);
  },

  // Delete order and restore stock
  delete: (id) => {

    const order =
      orderRepo.getById(id);

    if (!order) {
      return null;
    }

    db.exec('BEGIN IMMEDIATE;');

    try {

      // Restore stock for normal ordered items
      for (const item of order.items || []) {

        if (item.mode === 'order') {

          db.prepare(
            'UPDATE products SET stock = stock + ?, updatedAt = ? WHERE id = ?'
          ).run(
            Number(item.qty) || 0,
            new Date().toISOString(),
            String(item.productId)
          );
        }
      }

      // Delete order
      db.prepare(
        'DELETE FROM orders WHERE id = ?'
      ).run(String(id));

      db.exec('COMMIT;');

      return order;

    } catch (err) {

      db.exec('ROLLBACK;');

      throw err;
    }
  }
};


// Admin user queries
export const adminRepo = {

  getByUsername: (username) => {
    return db.prepare(
      'SELECT * FROM admins WHERE username = ? COLLATE NOCASE'
    ).get(username);
  },

  getById: (id) => {

    const r = db.prepare(
      'SELECT id, username, role, createdAt FROM admins WHERE id = ?'
    ).get(id);

    return r || null;
  },

  create: (
    username,
    passwordHash,
    role = 'admin'
  ) => {

    const now =
      new Date().toISOString();

    const stmt = db.prepare(
      'INSERT INTO admins (username, passwordHash, role, createdAt) VALUES (?, ?, ?, ?)'
    );

    const info = stmt.run(
      username,
      passwordHash,
      role,
      now
    );

    return adminRepo.getById(
      Number(info.lastInsertRowid)
    );
  },

  updateCredentials: (
    id,
    newUsername,
    newPasswordHash
  ) => {

    if (newUsername && newPasswordHash) {

      db.prepare(
        'UPDATE admins SET username = ?, passwordHash = ? WHERE id = ?'
      ).run(
        newUsername,
        newPasswordHash,
        id
      );

    } else if (newUsername) {

      db.prepare(
        'UPDATE admins SET username = ? WHERE id = ?'
      ).run(
        newUsername,
        id
      );

    } else if (newPasswordHash) {

      db.prepare(
        'UPDATE admins SET passwordHash = ? WHERE id = ?'
      ).run(
        newPasswordHash,
        id
      );
    }

    return adminRepo.getById(id);
  },

  count: () => {

    const r = db.prepare(
      'SELECT COUNT(*) as cnt FROM admins'
    ).get();

    return Number(r.cnt);
  }
};


export default db;
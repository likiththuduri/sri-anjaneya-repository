import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import dotenv from 'dotenv';
import db, { adminRepo, productRepo, settingsRepo } from './database.js';
import { hashPassword } from './auth.js';

dotenv.config();

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const uploadsDir = path.join(__dirname, process.env.UPLOAD_DIR || 'uploads');

if (!fs.existsSync(uploadsDir)) {
  fs.mkdirSync(uploadsDir, { recursive: true });
}

export async function runSeed() {
  console.log('🌱 Starting database seed check...');

  // 1. Seed Admin
  if (adminRepo.count() === 0) {
    const adminUser = process.env.ADMIN_USER || 'admin';
    const adminPass = process.env.ADMIN_PASS || 'admin123';
    const hashed = await hashPassword(adminPass);
    adminRepo.create(adminUser, hashed, 'admin');
    console.log(`✅ Default admin account created: "${adminUser}" with secure bcrypt hash.`);
  } else {
    console.log('ℹ️ Admin account already exists in database.');
  }

  // 2. Extract hero image to physical file if needed and seed settings
  const heroFilePath = path.join(uploadsDir, 'hero-default.jpg');
  let heroUrl = '';

  if (!fs.existsSync(heroFilePath)) {
    try {
      const candidates = [
        path.join('C:', 'Users', 'likit', 'Downloads', 'Sri Anjaneya Fertilizer, Pesticides and Seeds.html'),
        path.join('C:', 'Users', 'likit', 'Downloads', 'sri-anjaneya (3).html')
      ];

      for (const candidate of candidates) {
        if (fs.existsSync(candidate)) {
          const content = fs.readFileSync(candidate, 'utf8');
          const marker = 'heroImage:"data:image/jpeg;base64,';
          const startIdx = content.indexOf(marker);
          if (startIdx !== -1) {
            const dataStart = startIdx + marker.length;
            const endIdx = content.indexOf('"', dataStart);
            if (endIdx !== -1) {
              const b64 = content.substring(dataStart, endIdx);
              const buffer = Buffer.from(b64, 'base64');
              fs.writeFileSync(heroFilePath, buffer);
              console.log(`✅ Extracted original hero image (${Math.round(buffer.length / 1024)} KB) to ${heroFilePath}`);
              heroUrl = '/uploads/hero-default.jpg';
              break;
            }
          }
        }
      }
    } catch (err) {
      console.warn('⚠️ Could not extract original hero image file:', err.message);
    }
  } else {
    heroUrl = '/uploads/hero-default.jpg';
  }

  const logoFilePath = path.join(uploadsDir, 'logo-default.png');
  const logoUrl = fs.existsSync(logoFilePath) ? '/uploads/logo-default.png' : '';

  // Seed Settings
  let currentSettings = settingsRepo.get();
  if (!currentSettings || !currentSettings.shopName) {
    settingsRepo.upsert({
      shopName: 'Sri Anjaneya Fertilizers, Pesticides and Seeds',
      phone: '917095891270',
      whatsapp: '917095891270',
      address: 'Near Old Bus Stand, Main Road, Agricultural Market',
      mapLink: 'https://maps.google.com/?q=Sri+Anjaneya+Fertilizers',
      mapEmbed: '',
      upiId: 'srianjaneya@upi',
      heroImage: heroUrl || (fs.existsSync(heroFilePath) ? '/uploads/hero-default.jpg' : ''),
      logo: logoUrl
    });
    console.log('✅ Default shop settings and branding seeded.');
  } else {
    // If settings had an old base64 heroImage or empty, update it with file URL
    let needsUpdate = false;
    const updated = { ...currentSettings };
    if (heroUrl && (!updated.heroImage || updated.heroImage.startsWith('data:'))) {
      updated.heroImage = heroUrl;
      needsUpdate = true;
    }
    if (logoUrl && (!updated.logo || updated.logo.startsWith('data:'))) {
      updated.logo = logoUrl;
      needsUpdate = true;
    }
    if (needsUpdate) {
      settingsRepo.upsert(updated);
      console.log('✅ Updated settings to use file URLs for hero and logo images.');
    } else {
      console.log('ℹ️ Shop settings already exist in database.');
    }
  }

  // 3. Seed Products
  const products = productRepo.getAll();
  if (products.length === 0) {
    const initialProducts = [
      {
        id: '1',
        name: 'Urea',
        category: 'Fertilizers',
        brand: 'IFFCO',
        pack: '45 KG',
        price: 350,
        rating: 4.5,
        stock: 50,
        desc: 'General purpose nitrogen fertilizer for healthy crop growth and green foliage.',
        image: '',
        bookable: false
      },
      {
        id: '2',
        name: 'DAP',
        category: 'Fertilizers',
        brand: 'IFFCO',
        pack: '50 KG',
        price: 1350,
        rating: 4.5,
        stock: 20,
        desc: 'Di-ammonium phosphate for vigorous root development and early plant vigor.',
        image: '',
        bookable: false
      },
      {
        id: '3',
        name: 'Sample Pesticide',
        category: 'Pesticides',
        brand: 'Generic',
        pack: '1 L',
        price: 450,
        rating: 4.0,
        stock: 10,
        desc: 'Broad-spectrum crop protection against common pests and insects.',
        image: '',
        bookable: false
      },
      {
        id: '4',
        name: 'Sample Seeds',
        category: 'Seeds',
        brand: 'Generic',
        pack: '5 KG',
        price: 600,
        rating: 4.5,
        stock: 15,
        desc: 'High-yield certified agricultural seeds tested for high germination rates.',
        image: '',
        bookable: true
      }
    ];

    for (const p of initialProducts) {
      productRepo.create(p);
    }
    console.log(`✅ Seeded ${initialProducts.length} default catalog products.`);
  } else {
    console.log(`ℹ️ Catalog already has ${products.length} products.`);
  }

  // 4. Seed Order Sequence
  const seqRow = db.prepare('SELECT lastSeq FROM order_seq WHERE id = 1').get();
  if (!seqRow) {
    db.prepare('INSERT INTO order_seq (id, lastSeq) VALUES (1, 1000)').run();
    console.log('✅ Initialized order sequence starting at #1000.');
  }

  console.log('🌱 Database check and seeding complete!');
}

// Auto-run if executed directly
if (process.argv[1] && path.resolve(process.argv[1]) === path.resolve(fileURLToPath(import.meta.url))) {
  runSeed().catch(console.error);
}

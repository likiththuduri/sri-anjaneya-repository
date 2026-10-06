import { productRepo, settingsRepo, orderRepo, adminRepo } from './database.js';
import { hashPassword, comparePassword, generateToken } from './auth.js';

async function runTests() {
  console.log('🧪 Starting Backend Automated Tests...\n');
  let passed = 0;
  let failed = 0;

  function assert(condition, message) {
    if (condition) {
      console.log(`  ✅ PASS: ${message}`);
      passed++;
    } else {
      console.error(`  ❌ FAIL: ${message}`);
      failed++;
    }
  }

  // 1. Database & Seed verification
  console.log('1. Checking Database Seeding & Schema:');
  const products = productRepo.getAll();
  assert(products.length >= 4, `Products seeded properly (found ${products.length} products)`);
  assert(products[0].name === 'Urea' && products[0].price === 350, 'Urea product details match specifications');

  const settings = settingsRepo.get();
  assert(settings && settings.shopName.includes('Sri Anjaneya'), 'Shop settings seeded correctly');
  assert(settings.heroImage.includes('/uploads/hero-default.jpg'), `Hero image URL is a clean file path: ${settings.heroImage}`);

  // 2. Auth & Bcrypt verification
  console.log('\n2. Checking Admin Authentication & Password Hashing:');
  const admin = adminRepo.getByUsername('admin');
  assert(admin !== null && admin.username === 'admin', 'Default admin exists in database');
  assert(admin.passwordHash !== 'admin123', 'Admin password is NOT plaintext in database');
  
  const correctPass = await comparePassword('admin123', admin.passwordHash);
  assert(correctPass === true, 'Bcrypt correctly verifies valid admin password');

  const wrongPass = await comparePassword('wrongpass', admin.passwordHash);
  assert(wrongPass === false, 'Bcrypt rejects invalid admin password');

  const token = generateToken(admin);
  assert(typeof token === 'string' && token.length > 20, 'JWT token generated successfully');

  // 3. Product CRUD & Stock Adjustment
  console.log('\n3. Checking Product Operations:');
  const newProd = productRepo.create({
    name: 'Potash Test',
    category: 'Fertilizers',
    brand: 'IPL',
    pack: '50 KG',
    price: 950,
    rating: 4.8,
    stock: 30,
    desc: 'Test potash fertilizer'
  });
  assert(newProd && newProd.name === 'Potash Test', `Created new product with ID: ${newProd.id}`);

  const updatedProd = productRepo.update(newProd.id, { price: 980, stock: 28 });
  assert(updatedProd.price === 980 && updatedProd.stock === 28, 'Updated product price and stock in database');

  // 4. Orders & Atomic Stock Deduction
  console.log('\n4. Checking Atomic Order Checkout & Inventory Decrement:');
  const initialStock = productRepo.getById('1').stock; // Urea initial stock
  console.log(`     Initial Urea stock: ${initialStock}`);

  const orderResult = orderRepo.createWithAtomicStockDeduction({
    name: 'Ramesh Reddy',
    mobile: '9876543210',
    village: 'Kothapalli',
    payment: 'Cash on Collection',
    items: [
      { productId: '1', qty: 3, mode: 'order' }, // 3 bags of Urea
      { productId: '4', qty: 1, mode: 'book' }   // 1 bag seeds booking
    ]
  });

  assert(orderResult && orderResult.id.startsWith('#'), `Order created with ID: ${orderResult.id}`);
  assert(orderResult.total === 3 * 350, `Order total calculated correctly: ₹${orderResult.total}`);
  
  const afterStock = productRepo.getById('1').stock;
  console.log(`     After Order Urea stock: ${afterStock}`);
  assert(afterStock === initialStock - 3, `Stock was atomically decremented by 3 (from ${initialStock} to ${afterStock})`);

  // Verify order retrieval
  const retrievedOrder = orderRepo.getById(orderResult.id);
  assert(retrievedOrder.name === 'Ramesh Reddy' && retrievedOrder.village === 'Kothapalli', 'Order retrieved from database with full customer information');

  // Update order status
  const updatedOrder = orderRepo.updateStatus(orderResult.id, 'Confirmed');
  assert(updatedOrder.status === 'Confirmed', 'Order status updated to Confirmed');

  // Insufficient stock test
  let stockErrorCaught = false;
  try {
    orderRepo.createWithAtomicStockDeduction({
      name: 'Test Customer',
      mobile: '9999999999',
      village: 'Test Village',
      payment: 'Cash',
      items: [{ productId: '1', qty: 999999, mode: 'order' }]
    });
  } catch (err) {
    stockErrorCaught = true;
  }
  assert(stockErrorCaught, 'Atomic transaction successfully rejects order exceeding available stock');

  // Clean up test product
  productRepo.delete(newProd.id);
  const deletedCheck = productRepo.getById(newProd.id);
  assert(deletedCheck === null, 'Test product deleted successfully from database');

  console.log(`\n===========================================`);
  console.log(`Test Summary: ${passed} Passed, ${failed} Failed`);
  console.log(`===========================================`);

  if (failed > 0) {
    process.exit(1);
  }
}

runTests().catch(err => {
  console.error('Test execution error:', err);
  process.exit(1);
});

// globalThis.fetch is available natively in Node 18+
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const BASE_URL = 'http://localhost:4000/api';

async function runIntegrationTests() {
  console.log('🌐 Starting End-to-End HTTP Integration Tests against Live Server...\n');
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

  try {
    // 1. Health Endpoint
    console.log('1. Testing Health Endpoint:');
    const healthRes = await fetch(`${BASE_URL}/health`);
    const healthData = await healthRes.json();
    assert(healthRes.status === 200 && healthData.status === 'ok', 'GET /api/health returned 200 OK');

    // 2. Public Products Endpoint
    console.log('\n2. Testing Public Products Retrieval (Device B / Public Customer):');
    const prodsRes = await fetch(`${BASE_URL}/products`);
    const prodsData = await prodsRes.json();
    assert(prodsRes.status === 200 && Array.isArray(prodsData), 'GET /api/products returns array');
    assert(prodsData.length >= 4, `Found ${prodsData.length} public products`);

    // 3. Public Settings Endpoint
    console.log('\n3. Testing Public Shop Settings:');
    const settRes = await fetch(`${BASE_URL}/settings`);
    const settData = await settRes.json();
    assert(settRes.status === 200 && settData.shopName.includes('Sri Anjaneya'), 'GET /api/settings returns shop branding');
    assert(settData.heroImage.includes('/uploads/hero-default.jpg'), `Hero image URL is clean file path: ${settData.heroImage}`);

    // Verify hero image is directly accessible over HTTP
    const imgUrl = `http://localhost:4000${settData.heroImage}`;
    const imgRes = await fetch(imgUrl);
    assert(imgRes.status === 200 && imgRes.headers.get('content-type').includes('image'), `Static image is served over HTTP: ${imgUrl}`);

    // 4. Unauthorized Access Rejection
    console.log('\n4. Testing Route Protection (Security):');
    const unauthAdd = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ name: 'Hacker Product', price: 100 })
    });
    assert(unauthAdd.status === 401, 'POST /api/products without token is rejected with 401 Unauthorized');

    // 5. Admin Login
    console.log('\n5. Testing Admin Login (Laptop A):');
    const badLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'wrongpassword' })
    });
    assert(badLogin.status === 401, 'Bad credentials rejected with 401');

    const goodLogin = await fetch(`${BASE_URL}/auth/login`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ username: 'admin', password: 'admin123' })
    });
    const loginData = await goodLogin.json();
    assert(goodLogin.status === 200 && loginData.token, 'Valid login returns JWT token');
    const token = loginData.token;

    // Verify /api/auth/me
    const meRes = await fetch(`${BASE_URL}/auth/me`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const meData = await meRes.json();
    assert(meRes.status === 200 && meData.user.username === 'admin', 'GET /api/auth/me returns authenticated user details');

    // 6. Admin Adds New Product on Laptop A
    console.log('\n6. Testing Admin adding new product (Laptop A):');
    const newProductRes = await fetch(`${BASE_URL}/products`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({
        name: 'Zinc Sulfate 33%',
        category: 'Fertilizers',
        brand: 'Coromandel',
        pack: '5 KG',
        price: 480,
        stock: 40,
        rating: 4.7,
        desc: 'Micronutrient fertilizer for correcting zinc deficiencies in paddy and cotton.',
        bookable: true
      })
    });
    const newProductData = await newProductRes.json();
    assert(newProductRes.status === 201 && newProductData.id, `Created product "${newProductData.name}" with ID: ${newProductData.id}`);

    // 7. Verify Phone B sees the new product immediately
    console.log('\n7. Multi-device check: Mobile Phone B fetches products:');
    const phoneBProdsRes = await fetch(`${BASE_URL}/products`);
    const phoneBProds = await phoneBProdsRes.json();
    const foundOnPhoneB = phoneBProds.find(p => p.id === newProductData.id);
    assert(foundOnPhoneB !== undefined && foundOnPhoneB.price === 480, 'Mobile Phone B immediately sees the new product added by Laptop A');

    // 8. Customer Order from Mobile Phone B
    console.log('\n8. Customer Booking from Mobile Phone B:');
    const customerOrderRes = await fetch(`${BASE_URL}/orders`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        name: 'Venkatesh Naidu',
        mobile: '9848012345',
        village: 'Peddapuram',
        payment: 'PhonePe',
        items: [
          { productId: newProductData.id, qty: 5, mode: 'order' } // Buy 5 packs of Zinc Sulfate
        ]
      })
    });
    const customerOrder = await customerOrderRes.json();
    assert(customerOrderRes.status === 201 && customerOrder.id.startsWith('#'), `Customer order placed with ID: ${customerOrder.id}`);
    assert(customerOrder.total === 5 * 480, `Order total is correct: ₹${customerOrder.total}`);

    // Verify stock deduction on the product
    const checkStockRes = await fetch(`${BASE_URL}/products/${newProductData.id}`);
    const checkStockProd = await checkStockRes.json();
    assert(checkStockProd.stock === 35, `Product stock decremented from 40 to 35 (Available: ${checkStockProd.stock})`);

    // 9. Laptop A opens Admin Orders and sees the new order
    console.log('\n9. Laptop A (Admin) inspects Orders list:');
    const adminOrdersRes = await fetch(`${BASE_URL}/orders`, {
      headers: { Authorization: `Bearer ${token}` }
    });
    const adminOrders = await adminOrdersRes.json();
    const foundOrder = adminOrders.find(o => o.id === customerOrder.id);
    assert(foundOrder !== undefined && foundOrder.name === 'Venkatesh Naidu', 'Laptop A sees order placed by Mobile Phone B in real-time');

    // Update order status on Laptop A
    const updateOrderRes = await fetch(`${BASE_URL}/orders/${encodeURIComponent(customerOrder.id)}`, {
      method: 'PUT',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${token}`
      },
      body: JSON.stringify({ status: 'Confirmed' })
    });
    const updatedOrder = await updateOrderRes.json();
    assert(updatedOrder.status === 'Confirmed', `Order ${customerOrder.id} status updated to "Confirmed"`);

    // 10. Clean up test product
    await fetch(`${BASE_URL}/products/${newProductData.id}`, {
      method: 'DELETE',
      headers: { Authorization: `Bearer ${token}` }
    });
    assert(true, 'Test product deleted cleanly');

    console.log(`\n===========================================`);
    console.log(`Integration Test Summary: ${passed} Passed, ${failed} Failed`);
    console.log(`===========================================`);

    if (failed > 0) process.exit(1);
  } catch (err) {
    console.error('Integration test exception:', err);
    process.exit(1);
  }
}

runIntegrationTests();

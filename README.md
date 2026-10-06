# Sri Anjaneya Fertilizers, Pesticides and Seeds — Full-Stack Website

This is the full-stack website for **Sri Anjaneya Fertilizers, Pesticides and Seeds** with a persistent SQL database backend, multi-device synchronization, secure admin authentication, file uploads, and WhatsApp order flow.

---

## 🚀 How to Run Locally

### Step 1: Open Terminal in the Backend Directory
```bash
cd backend
```

### Step 2: Start the Backend Server
```bash
node server.js
```

The server will automatically:
- Check and initialize the SQLite database (`sri_anjaneya.db`)
- Ensure default admin credentials and catalog products are seeded
- Serve the website frontend and REST API on port **4000**:
  - **Website**: http://localhost:4000
  - **Admin Login**: http://localhost:4000/#/admin/login
  - **API Endpoints**: http://localhost:4000/api
  - **Uploaded Images**: http://localhost:4000/uploads

---

## 📱 How to Access from Mobile Phone (Same Wi-Fi Network)

1. Find your computer's local IP address by running `ipconfig` in PowerShell / Command Prompt (e.g., `192.168.1.15`).
2. Open your mobile phone browser and visit:
   ```
   http://<YOUR_COMPUTER_IP>:4000
   ```
   *(Example: `http://192.168.1.15:4000`)*
3. Any changes made on your laptop (products, pricing, stock, banner image) will appear immediately on your phone!
4. Any orders placed from customer phones will be saved to the database in real-time and will decrement stock atomically.

---

## 🔐 Admin Login

- **Username**: `admin`
- **Password**: `admin123`

To log in, click **Admin** in the navigation header or go directly to:
[http://localhost:4000/#/admin/login](http://localhost:4000/#/admin/login)

You can change your username and password anytime in **Admin > Settings > Admin Profile & Login**.

---

## 🧪 Automated Tests

From the `backend` directory:
- Run Unit Tests: `node test.js`
- Run Multi-Device Integration Tests: `node integration_test.js`

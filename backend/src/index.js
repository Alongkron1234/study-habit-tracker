/**
 * index.js — entry-point: โหลด environment แล้วเปิดเซิร์ฟเวอร์
 *
 * ตัวแอปอยู่ที่ app.js (createApp) เพื่อให้เทสต์ใช้ร่วมกันได้
 *
 * Requirements: NFR-07 (runs with one command), NFR-08 (no secrets)
 */
const path = require('path');
const dotenv = require('dotenv');

// โหลด .env จาก backend/ ก่อน ถ้าไม่มีให้ค้นหาที่ repo root
dotenv.config({ path: path.resolve(__dirname, '../.env') });
dotenv.config({ path: path.resolve(__dirname, '../../.env') });

const { createApp } = require('./app');

const PORT = process.env.PORT || process.env.APP_PORT || 3000;

let app;
try {
  app = createApp();
} catch (err) {
  console.error('[fatal]', err.message);
  process.exit(1);
}

app.listen(PORT, () => {
  console.log(`[app] running on port ${PORT}`);
});

/**
 * errors.js — รูปแบบ error ที่ปลอดภัย (F-02, NFR-06)
 *
 * ทุก error ตอบ { error: <ข้อความคงที่ตามสถานะ> } เท่านั้น
 * ไม่ส่ง err.message ของ library, stack trace หรือข้อความ SQL ออกไป
 * รายละเอียดจริง log ฝั่งเซิร์ฟเวอร์เท่านั้น
 */
const CLIENT_MESSAGES = {
  400: 'Bad Request',
  401: 'Unauthorized',
  403: 'Forbidden',
  404: 'Not Found',
};

function notFound(_req, res) {
  res.status(404).json({ error: 'Not Found' });
}

// eslint-disable-next-line no-unused-vars
function errorHandler(err, _req, res, _next) {
  const isClientError = Number.isInteger(err.status) && err.status >= 400 && err.status < 500;

  console.error('[server error]', err);

  if (!isClientError) {
    return res.status(500).json({ error: 'Internal Server Error' });
  }
  return res.status(err.status).json({ error: CLIENT_MESSAGES[err.status] || 'Bad Request' });
}

module.exports = { notFound, errorHandler };

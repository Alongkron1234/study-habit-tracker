/**
 * goal-update.js — อัปเดต goal ของ F-10 ด้วยคำสั่ง SQL เดียว (S-9)
 * แก้ทั้ง target_minutes และ end_date พร้อมกันหรือไม่เปลี่ยนเลย และมีเงื่อนไข end_date >= today
 * กัน race กรณี goal จบพอดีระหว่างที่ตรวจกับตอนบันทึก
 */
const pool = require('../db/db');

/**
 * @param {{ id: number, userId: number, fields: { target_minutes?: number, end_date?: string }, today: string }} args
 * @returns {Promise<object|null>} goal ที่อัปเดตแล้ว หรือ null ถ้าไม่มีแถวถูกอัปเดต (goal จบแล้ว/ไม่ใช่ของผู้ใช้)
 */
async function updateActiveGoal({ id, userId, fields, today }) {
  const { rows } = await pool.query(
    `UPDATE goals
        SET target_minutes = COALESCE($3::int, target_minutes),
            end_date = COALESCE($4::date, end_date),
            updated_at = now()
      WHERE id = $1 AND user_id = $2 AND end_date >= $5::date
      RETURNING id, template_id, target_minutes, start_date, end_date,
        CASE WHEN end_date < $5::date THEN 'ended' ELSE 'active' END AS status`,
    [id, userId, fields.target_minutes ?? null, fields.end_date ?? null, today]
  );
  return rows[0] || null;
}

module.exports = { updateActiveGoal };

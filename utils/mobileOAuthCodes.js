// =========================
// Cầu nối OAuth cho mobile app
// =========================
// Web đăng nhập Google/Discord bằng session (passport), nhưng app mobile
// không có cookie chung với server -> cần 1 "code" ngắn hạn, dùng 1 lần,
// đổi lấy access/refresh token JWT (xem routes/auth.js + routes/api/auth.js).
//
// Lưu trong bộ nhớ (Map) là đủ vì code chỉ sống ~2 phút. Nếu sau này scale
// nhiều instance thì nên chuyển sang Redis, nhưng hiện tại 1 instance nên
// không cần.

const CODE_TTL_MS = 2 * 60 * 1000; // 2 phút

const codes = new Map(); // code -> { userId, expiresAt }

function createCode(userId) {
  const code = require("crypto").randomBytes(24).toString("hex");
  codes.set(code, { userId: String(userId), expiresAt: Date.now() + CODE_TTL_MS });
  return code;
}

function consumeCode(code) {
  const entry = codes.get(code);
  if (!entry) return null;
  codes.delete(code); // dùng 1 lần

  if (entry.expiresAt < Date.now()) return null;
  return entry.userId;
}

// Dọn code hết hạn định kỳ, tránh rò rỉ bộ nhớ nếu ai đó bỏ dở luồng OAuth
setInterval(() => {
  const now = Date.now();
  for (const [code, entry] of codes.entries()) {
    if (entry.expiresAt < now) codes.delete(code);
  }
}, 5 * 60 * 1000).unref();

module.exports = { createCode, consumeCode };

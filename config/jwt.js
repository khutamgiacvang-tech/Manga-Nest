const jwt = require("jsonwebtoken");

// =========================
// JWT cho Mobile API
// =========================
// Web hiện tại dùng session (express-session + passport). Mobile app
// không có cookie/session dùng chung với domain server -> cần cấp
// access token (JWT) riêng cho các endpoint /api/v1/*.
//
// QUAN TRỌNG: đặt JWT_SECRET trong file .env, KHÔNG commit secret vào
// code. Nếu thiếu biến này, app sẽ throw lỗi ngay khi khởi động thay vì
// âm thầm ký token bằng secret rỗng/đoán được.

if (!process.env.JWT_SECRET) {
  throw new Error(
    "Thiếu JWT_SECRET trong file .env. Hãy thêm dòng: JWT_SECRET=<chuỗi ngẫu nhiên dài>",
  );
}

const JWT_SECRET = process.env.JWT_SECRET;
const ACCESS_TOKEN_EXPIRES_IN = "15m"; // access token sống ngắn
const REFRESH_TOKEN_EXPIRES_IN = "30d"; // refresh token sống dài, lưu trong SecureStore của app

function signAccessToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      role: user.role,
    },
    JWT_SECRET,
    { expiresIn: ACCESS_TOKEN_EXPIRES_IN },
  );
}

function signRefreshToken(user) {
  return jwt.sign(
    {
      sub: user._id.toString(),
      type: "refresh",
    },
    JWT_SECRET,
    { expiresIn: REFRESH_TOKEN_EXPIRES_IN },
  );
}

function verifyToken(token) {
  // Ném lỗi nếu token sai/hết hạn -> caller tự bắt (middleware/apiAuth.js)
  return jwt.verify(token, JWT_SECRET);
}

module.exports = {
  signAccessToken,
  signRefreshToken,
  verifyToken,
  ACCESS_TOKEN_EXPIRES_IN,
  REFRESH_TOKEN_EXPIRES_IN,
};

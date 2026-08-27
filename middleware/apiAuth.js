const { verifyToken } = require("../config/jwt");
const User = require("../models/User");

// =========================
// Xác thực API bằng JWT (Authorization: Bearer <token>)
// =========================
// Song song với session/passport dùng cho web (req.isAuthenticated()),
// KHÔNG thay thế. Web vẫn giữ nguyên session như cũ.

function getTokenFromHeader(req) {
  const header = req.headers.authorization || "";

  if (!header.startsWith("Bearer ")) {
    return null;
  }

  return header.slice("Bearer ".length).trim();
}

// Bắt buộc đăng nhập: dùng cho route cần biết chắc chắn user là ai
// (follow, lịch sử đọc, comment, profile...).
exports.requireAuth = async (req, res, next) => {
  try {
    const token = getTokenFromHeader(req);

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Thiếu access token.",
      });
    }

    let payload;

    try {
      payload = verifyToken(token);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "Access token không hợp lệ hoặc đã hết hạn.",
        code: "TOKEN_EXPIRED",
      });
    }

    const user = await User.findById(payload.sub);

    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Tài khoản không tồn tại.",
      });
    }

    if (
      user.status === "banned" &&
      (user.isPermanentBan || (user.banUntil && user.banUntil > new Date()))
    ) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa.",
        banReason: user.banReason,
        banUntil: user.banUntil,
      });
    }

    req.user = user;

    next();
  } catch (err) {
    console.error("[apiAuth.requireAuth]", err);

    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// Không bắt buộc đăng nhập: dùng cho route như đọc manga/chapter, nơi
// khách vẫn xem được nhưng nếu có token hợp lệ thì cá nhân hóa thêm
// (VD: hiển thị progress đọc dở, trạng thái đã follow...).
exports.optionalAuth = async (req, res, next) => {
  try {
    const token = getTokenFromHeader(req);

    if (!token) {
      req.user = null;
      return next();
    }

    const payload = verifyToken(token);
    const user = await User.findById(payload.sub);

    req.user = user || null;

    next();
  } catch (err) {
    // Token hỏng/hết hạn ở route optional -> coi như khách, không chặn
    req.user = null;
    next();
  }
};

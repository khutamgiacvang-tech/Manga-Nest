const express = require("express");
const { verifyToken } = require("../config/jwt");
const User = require("../models/User");

const router = express.Router();

// Bridge cho React Native WebView:
// Mobile đăng nhập bằng JWT, còn các trang EJS của web dùng Passport session.
// Endpoint này nhận JWT qua Authorization header, tạo session web cho đúng user,
// rồi chuyển hướng tới MỘT route nội bộ được allowlist.
const ALLOWED_PATHS = new Set([
  "/profile",
  "/support",
  "/translator/apply",
  "/translator/application",
  "/library",
  "/history",
  "/my-manga",
  "/admin",
  "/policy",
]);

function getBearer(req) {
  const value = req.headers.authorization || "";
  return value.startsWith("Bearer ") ? value.slice(7).trim() : null;
}

router.get("/mobile/web-session", async (req, res) => {
  try {
    const token = getBearer(req);
    if (!token) return res.status(401).send("Thiếu access token.");

    let payload;
    try {
      payload = verifyToken(token);
    } catch {
      return res.status(401).send("Access token không hợp lệ hoặc đã hết hạn.");
    }

    const user = await User.findById(payload.sub);
    if (!user) return res.status(401).send("Tài khoản không tồn tại.");

    if (
      user.status === "banned" &&
      (user.isPermanentBan || (user.banUntil && new Date(user.banUntil) > new Date()))
    ) {
      return res.status(403).send("Tài khoản đã bị khóa.");
    }

    let redirect = String(req.query.redirect || "/");
    // Chỉ cho path nội bộ, tuyệt đối không cho URL ngoài để tránh open redirect.
    redirect = redirect.split("#")[0].split("?")[0];
    if (!redirect.startsWith("/")) redirect = "/";
    if (!ALLOWED_PATHS.has(redirect)) redirect = "/";

    req.logIn(user, { session: true }, (err) => {
      if (err) {
        console.error("[mobile web session]", err);
        return res.status(500).send("Không thể tạo phiên đăng nhập web.");
      }
      return res.redirect(redirect);
    });
  } catch (err) {
    console.error("[mobile web-session]", err);
    return res.status(500).send("Lỗi máy chủ.");
  }
});

module.exports = router;

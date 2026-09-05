const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const authApi = require("../../controllers/api/authApiController");
const { requireAuth } = require("../../middleware/apiAuth");

// =========================
// Upload avatar: dùng chung thư mục "temp" trên đĩa như routes/api/upload.js,
// sau đó authApiController.updateProfile đẩy tiếp lên Supabase Storage
// (giống hệt luồng web ở controllers/profileController.js).
// =========================
if (!fs.existsSync("temp")) {
  fs.mkdirSync("temp");
}

const avatarUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, "temp");
    },
    filename(req, file, cb) {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(null, unique + path.extname(file.originalname));
    },
  }),
  limits: { fileSize: 5 * 1024 * 1024 },
});

// POST /api/v1/auth/register
router.post("/register", authApi.register);

// POST /api/v1/auth/login  -> { accessToken, refreshToken, user }
router.post("/login", authApi.login);

// POST /api/v1/auth/oauth/exchange -> đổi code từ Google/Discord (routes/auth.js) lấy JWT
router.post("/oauth/exchange", authApi.oauthExchange);

// POST /api/v1/auth/oauth/google -> đăng nhập Google native bằng ID token
router.post("/oauth/google", authApi.googleNativeLogin);

// POST /api/v1/auth/refresh -> { accessToken }
router.post("/refresh", authApi.refresh);

// GET /api/v1/auth/me  (cần Authorization: Bearer <accessToken>)
router.get("/me", requireAuth, authApi.me);

// POST /api/v1/auth/profile  (cập nhật hồ sơ, multipart: avatar)
router.post(
  "/profile",
  requireAuth,
  avatarUpload.single("avatar"),
  authApi.updateProfile,
);

// POST /api/v1/auth/change-password
router.post("/change-password", requireAuth, authApi.changePassword);

module.exports = router;

const express = require("express");
const router = express.Router();
const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadApi = require("../../controllers/api/uploadApiController");
const { requireAuth } = require("../../middleware/apiAuth");

// =========================
// Song song hoàn toàn với routes/manga.js (bản web) — dùng chung thư
// mục temp trên đĩa, khác ở chỗ auth qua JWT (Bearer token) thay vì
// session, và mọi response đều là JSON.
// =========================

if (!fs.existsSync("temp")) {
  fs.mkdirSync("temp");
}

const diskStorage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, "temp");
  },
  filename(req, file, cb) {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({ storage: diskStorage });
const chapterUpload = multer({ storage: diskStorage });

// Mọi route trong file này đều cần đăng nhập (JWT)
router.use(requireAuth);

// GET /api/v1/upload/genres
router.get("/genres", uploadApi.genres);

// GET /api/v1/upload/my-manga  (danh sách truyện của tôi)
router.get("/my-manga", uploadApi.myManga);

// GET /api/v1/upload/my-manga/:slug  (quản lý 1 truyện + chapter)
router.get("/my-manga/:slug", uploadApi.mangaDetail);

// POST /api/v1/upload/my-manga/:slug/edit  (sửa thông tin truyện)
router.post("/my-manga/:slug/edit", uploadApi.updateManga);

// POST /api/v1/upload/my-manga/:slug/cover  (đổi cover)
router.post(
  "/my-manga/:slug/cover",
  upload.single("cover"),
  uploadApi.changeCover,
);

// POST /api/v1/upload/my-manga/:slug/banner  (đổi banner)
router.post(
  "/my-manga/:slug/banner",
  upload.single("banner"),
  uploadApi.changeBanner,
);

// DELETE /api/v1/upload/my-manga/:slug  (xóa truyện)
router.delete("/my-manga/:slug", uploadApi.deleteManga);

// DELETE /api/v1/upload/my-manga/:slug/chapter/:id  (xóa chapter)
router.delete("/my-manga/:slug/chapter/:id", uploadApi.deleteChapter);

// POST /api/v1/upload/manga  (tạo truyện mới, multipart: cover, banner)
router.post(
  "/manga",
  upload.fields([
    { name: "cover", maxCount: 1 },
    { name: "banner", maxCount: 1 },
  ]),
  uploadApi.createManga,
);

// POST /api/v1/upload/manga/:slug/chapter  (upload chapter, multipart: zip)
router.post(
  "/manga/:slug/chapter",
  chapterUpload.single("zip"),
  uploadApi.uploadChapter,
);

module.exports = router;

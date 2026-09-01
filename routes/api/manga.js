const express = require("express");
const router = express.Router();

const mangaApi = require("../../controllers/api/mangaApiController");
const commentApi = require("../../controllers/api/commentApiController");
const { requireAuth, optionalAuth } = require("../../middleware/apiAuth");

// =========================
// QUAN TRỌNG: các route path cố định (/history/list, /history) phải
// đặt TRƯỚC route "/:slug" -> nếu không Express sẽ hiểu "history" là
// giá trị của :slug và không bao giờ chạy tới đúng route bên dưới.
// =========================

// GET /api/v1/manga/home
router.get("/home", mangaApi.home);

// GET /api/v1/manga/search?q=...
router.get("/search", mangaApi.search);

// GET /api/v1/manga/list?genre=romance,comedy&page=1
router.get("/list", mangaApi.list);

// GET /api/v1/manga/genres
router.get("/genres", mangaApi.genres);

// GET /api/v1/manga/history/list  (cần đăng nhập)
router.get("/history/list", requireAuth, mangaApi.historyList);

// GET /api/v1/manga/follow/list?page=1  (cần đăng nhập) — danh sách truyện đang theo dõi
router.get("/follow/list", requireAuth, mangaApi.followList);

// POST /api/v1/manga/history  (lưu tiến độ đọc, cần đăng nhập)
router.post("/history", requireAuth, mangaApi.saveHistory);

// GET /api/v1/manga/:slug  (khách xem được, nếu có token thì cá nhân hóa isFollowing/history)
router.get("/:slug", optionalAuth, mangaApi.detail);

// GET /api/v1/manga/:slug/chapter/:number  (khách đọc được, có token thì tính view + lưu progress)
router.get("/:slug/chapter/:number", optionalAuth, mangaApi.readChapter);

// POST /api/v1/manga/:slug/follow  (cần đăng nhập)
router.post("/:slug/follow", requireAuth, mangaApi.toggleFollow);

// =========================
// Comment theo chapter (lồng trong manga)
// =========================

// GET /api/v1/manga/:slug/chapter/:chapterNumber/comments
router.get(
  "/:slug/chapter/:chapterNumber/comments",
  optionalAuth,
  commentApi.getComments,
);

// POST /api/v1/manga/:slug/chapter/:chapterNumber/comments  (cần đăng nhập)
router.post(
  "/:slug/chapter/:chapterNumber/comments",
  requireAuth,
  commentApi.postComment,
);

module.exports = router;

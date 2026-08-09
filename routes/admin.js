const express = require("express");

const router = express.Router();

const adminController = require("../controllers/adminController");
const categoryController = require("../controllers/categoryController");

// ===================================
// Dashboard
// ===================================

router.get("/admin", adminController.dashboard);

// ===================================
// Translator Application
// ===================================

router.get("/admin/application/:id", adminController.getApplication);

router.post(
  "/admin/application/:id/approve",
  adminController.approveApplication,
);

router.post("/admin/application/:id/reject", adminController.rejectApplication);

// ===================================
// Manga
// ===================================

router.get("/admin/manga/:id", adminController.getManga);

router.post("/admin/manga/:id/approve", adminController.approveManga);

router.post("/admin/manga/:id/reject", adminController.rejectManga);

// ===================================
// Quản lý tài khoản
// ===================================

// Cách cũ
router.post("/admin/user/:id/lock", adminController.toggleLockUser);

// Ban
router.post("/admin/user/:id/ban", adminController.banUser);

// Mở ban
router.post("/admin/user/:id/unban", adminController.unbanUser);

// Xóa
router.post("/admin/user/:id/delete", adminController.deleteUser);

// Khôi phục (nếu dùng)
router.post("/admin/user/:id/restore", adminController.restoreUser);

// ===================================
// Quản lý bình luận (kiểm duyệt)
// ===================================

router.post("/admin/comment/:id/hide", adminController.toggleHideComment);

// ===================================
// Quản lý chương truyện (kiểm duyệt)
// ===================================

router.post("/admin/chapter/:id/hide", adminController.toggleHideChapter);
router.delete("/admin/chapter/:id", adminController.deleteChapterAdmin);

// ===================================
// Quản lý thể loại
// ===================================

router.post("/admin/category", categoryController.createCategory);
router.post("/admin/category/:id/delete", categoryController.deleteCategory);

module.exports = router;

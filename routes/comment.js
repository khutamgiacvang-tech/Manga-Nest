const express = require("express");
const router = express.Router();

const commentController = require("../controllers/commentController");

// Lấy danh sách bình luận của 1 chương
router.get(
  "/manga/:slug/chapter/:chapterNumber/comments",
  commentController.getComments,
);

// Đăng bình luận vào 1 chương
router.post(
  "/manga/:slug/chapter/:chapterNumber/comments",
  commentController.postComment,
);

// Sửa bình luận
router.put("/comments/:id", commentController.updateComment);

// Xóa bình luận
router.delete("/comments/:id", commentController.deleteComment);

module.exports = router;

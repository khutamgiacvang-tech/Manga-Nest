const express = require("express");
const router = express.Router();

const commentApi = require("../../controllers/api/commentApiController");
const { requireAuth } = require("../../middleware/apiAuth");

// PUT /api/v1/comments/:id  (cần đăng nhập, chỉ chủ comment)
router.put("/:id", requireAuth, commentApi.updateComment);

// DELETE /api/v1/comments/:id  (cần đăng nhập, chủ comment hoặc admin)
router.delete("/:id", requireAuth, commentApi.deleteComment);

module.exports = router;

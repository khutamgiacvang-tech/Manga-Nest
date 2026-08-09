const express = require("express");

const router = express.Router();

const profileController = require("../controllers/profileController");

const upload = require("../middleware/uploadAvatar");

// Hiển thị Profile
router.get("/profile", profileController.showProfile);

// Cập nhật Profile
router.post(
  "/profile/update",
  upload.single("avatar"),
  profileController.updateProfile,
);

// Đổi mật khẩu
router.post("/profile/change-password", profileController.changePassword);

router.get("/library", profileController.followLibrary);

module.exports = router;

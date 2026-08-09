const express = require("express");

const router = express.Router();

const multer = require("multer");

const translatorController = require("../controllers/translatorController");

// Upload thẳng vào RAM rồi đẩy lên Cloudinary (xem translatorController.js),
// không ghi file tạm ra ổ đĩa nữa -> tránh lỗi thư mục local không tồn tại.
const upload = multer({
    storage: multer.memoryStorage(),
    limits: {
        fileSize: 10 * 1024 * 1024,
    },
});

router.get(

    "/translator/apply",

    translatorController.showApply

);

router.post(

    "/translator/apply",

    upload.array("sampleImages", 5),

    translatorController.submitApplication

);

router.get(
    "/translator/application",
    translatorController.myApplication
);

// ⚠️ Phải đặt trước route /translator/:username
router.get(
    "/translator/:username/new-mangas",
    translatorController.showNewMangas
);

router.get(
    "/translator/:username/top-mangas",
    translatorController.showTopMangas
);

router.get(
    "/translator/:username",
    translatorController.showProfile
);

module.exports = router;
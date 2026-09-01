const express = require("express");
const router = express.Router();

// =========================
// API cho Mobile App (React Native)
// Song song hoàn toàn với web EJS hiện có — không đụng tới route web,
// không dùng session, chỉ xác thực bằng JWT (xem middleware/apiAuth.js).
// =========================

router.use("/auth", require("./auth"));
router.use("/manga", require("./manga"));
router.use("/comments", require("./comment"));
router.use("/notifications", require("./notification"));
router.use("/upload", require("./upload"));
router.use("/translator", require("./translator"));

module.exports = router;

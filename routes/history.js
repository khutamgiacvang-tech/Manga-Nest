const express = require("express");
const router = express.Router();
const ReadingHistory = require("../models/ReadingHistory");

// Lưu lịch sử đọc Web. Passport đặt user ở req.user.
router.post("/save", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ success: false, message: "Vui lòng đăng nhập." });
    }

    const {
      mangaId,
      mangaTitle,
      mangaSlug,
      cover,
      chapterTitle,
      chapterNumber,
      progress,
      scrollPosition,
    } = req.body;

    if (!mangaId || chapterNumber === undefined || chapterNumber === null) {
      return res.status(400).json({ success: false, message: "Thiếu thông tin chapter." });
    }

    const oldHistory = await ReadingHistory.findOne({
      user: req.user._id,
      manga: mangaId,
      chapterNumber,
    });

    const incomingProgress = Number(progress) || 0;
    const oldProgress = Number(oldHistory?.progress) || 0;

    // Không lùi tiến độ khi trình duyệt gửi request cũ/chậm hơn.
    const finalProgress = Math.min(100, Math.max(oldProgress, incomingProgress));

    // Nếu request cũ có progress thấp hơn bản đã lưu, giữ vị trí cũ.
    const finalScroll =
      incomingProgress < oldProgress
        ? Number(oldHistory?.scrollPosition) || 0
        : Math.max(0, Number(scrollPosition) || 0);

    await ReadingHistory.findOneAndUpdate(
      {
        user: req.user._id,
        manga: mangaId,
        chapterNumber,
      },
      {
        manga: mangaId,
        mangaTitle: mangaTitle || oldHistory?.mangaTitle || "",
        mangaSlug: mangaSlug || oldHistory?.mangaSlug || "",
        cover: cover || oldHistory?.cover || "",
        chapterNumber,
        chapterTitle: chapterTitle || oldHistory?.chapterTitle || "",
        progress: finalProgress,
        scrollPosition: finalScroll,
        updatedAt: new Date(),
      },
      { upsert: true, returnDocument: "after", setDefaultsOnInsert: true }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("[history/save]", err);
    return res.status(500).json({ success: false });
  }
});

router.get("/", async (req, res) => {
  try {
    if (!req.user) return res.redirect("/login");

    const histories = await ReadingHistory.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    return res.render("history/index", { histories });
  } catch (err) {
    console.error("[history]", err);
    return res.status(500).send("Không thể tải lịch sử đọc.");
  }
});

module.exports = router;

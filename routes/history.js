const express = require("express");
const router = express.Router();

const ReadingHistory = require("../models/ReadingHistory");

// POST /history/save
// Web reader và mobile app dùng chung ReadingHistory trong MongoDB.
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

    const numericProgress = Math.min(100, Math.max(0, Number(progress) || 0));
    const numericScroll = Math.max(0, Number(scrollPosition) || 0);

    const oldHistory = await ReadingHistory.findOne({
      user: req.user._id,
      manga: mangaId,
      chapterNumber,
    });

    // Không làm tụt tiến độ đã đạt được khi người đọc quay lại vị trí cũ.
    const finalProgress = oldHistory
      ? Math.max(oldHistory.progress || 0, numericProgress)
      : numericProgress;

    const finalScroll =
      oldHistory && numericProgress < (oldHistory.progress || 0)
        ? oldHistory.scrollPosition || 0
        : numericScroll;

    await ReadingHistory.findOneAndUpdate(
      {
        user: req.user._id,
        manga: mangaId,
        chapterNumber,
      },
      {
        manga: mangaId,
        mangaTitle,
        mangaSlug,
        cover: cover || oldHistory?.cover || "",
        chapterNumber,
        chapterTitle: chapterTitle || oldHistory?.chapterTitle || "",
        progress: finalProgress,
        scrollPosition: finalScroll,
        updatedAt: new Date(),
      },
      { upsert: true, returnDocument: "after" }
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("[web/history/save]", err);
    return res.status(500).json({ success: false });
  }
});

// Giữ route này nếu nơi khác trong project còn dùng /history.
// Trang lịch sử chính hiện được xử lý bởi mangaController.history.
router.get("/", async (req, res) => {
  if (!req.user) {
    return res.redirect("/login");
  }

  const histories = await ReadingHistory.find({
    user: req.user._id,
  }).sort({ updatedAt: -1 });

  return res.render("manga/history", { histories });
});

module.exports = router;

const express = require("express");
const router = express.Router();
const ReadingHistory = require("../models/ReadingHistory");

// Web reading history is handled here, before the generic manga router.
// This route intentionally logs every request so Render logs can immediately
// tell whether the browser reached the backend and whether Passport restored
// the logged-in user.
router.post("/save", async (req, res) => {
  const requestId = Math.random().toString(36).slice(2, 8);
  try {
    console.log(`[history/save:${requestId}] hit user=${req.user?._id || "NONE"}`);

    if (!req.user) {
      console.warn(`[history/save:${requestId}] 401 no req.user`);
      return res.status(401).json({ success: false, message: "Vui lòng đăng nhập." });
    }

    const { mangaId, mangaTitle, mangaSlug, cover, chapterTitle, chapterNumber, progress, scrollPosition } = req.body || {};
    const chapterNo = Number(chapterNumber);
    const incomingProgress = Math.min(100, Math.max(0, Number(progress) || 0));
    const incomingScroll = Math.max(0, Number(scrollPosition) || 0);

    if (!mangaId || !Number.isFinite(chapterNo)) {
      console.warn(`[history/save:${requestId}] 400 invalid manga/chapter`, { mangaId, chapterNumber });
      return res.status(400).json({ success: false, message: "Thiếu thông tin chapter." });
    }

    const oldHistory = await ReadingHistory.findOne({
      user: req.user._id,
      manga: mangaId,
      chapterNumber: chapterNo,
    }).lean();

    const oldProgress = Number(oldHistory?.progress) || 0;
    const finalProgress = Math.max(oldProgress, incomingProgress);
    const finalScroll = incomingProgress < oldProgress
      ? Number(oldHistory?.scrollPosition) || 0
      : incomingScroll;

    await ReadingHistory.findOneAndUpdate(
      { user: req.user._id, manga: mangaId, chapterNumber: chapterNo },
      {
        user: req.user._id,
        manga: mangaId,
        mangaTitle: mangaTitle || oldHistory?.mangaTitle || "",
        mangaSlug: mangaSlug || oldHistory?.mangaSlug || "",
        cover: cover || oldHistory?.cover || "",
        chapterNumber: chapterNo,
        chapterTitle: chapterTitle || oldHistory?.chapterTitle || "",
        progress: finalProgress,
        scrollPosition: finalScroll,
        updatedAt: new Date(),
      },
      { upsert: true, setDefaultsOnInsert: true }
    );

    console.log(`[history/save:${requestId}] SAVED manga=${mangaId} chapter=${chapterNo} progress=${finalProgress} scroll=${finalScroll}`);
    return res.json({ success: true, progress: finalProgress });
  } catch (err) {
    console.error(`[history/save:${requestId}] ERROR`, err);
    return res.status(500).json({ success: false, message: "Không thể lưu lịch sử." });
  }
});

router.get("/", async (req, res) => {
  try {
    console.log(`[history/page] user=${req.user?._id || "NONE"}`);
    if (!req.user) return res.redirect("/login");

    const histories = await ReadingHistory.find({ user: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    // Reuse the existing web history page, which already matches the site's UI.
    return res.render("manga/history", {
      title: "Lịch sử đọc",
      histories,
    });
  } catch (err) {
    console.error("[history/page] ERROR", err);
    return res.status(500).send("Không thể tải lịch sử đọc.");
  }
});

module.exports = router;

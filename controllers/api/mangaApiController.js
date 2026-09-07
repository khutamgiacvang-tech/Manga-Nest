const Manga = require("../../models/Manga");
const Chapter = require("../../models/Chapter");
const Comment = require("../../models/Comment");
const ReadingHistory = require("../../models/ReadingHistory");
const ChapterView = require("../../models/ChapterView");
const removeVietnameseTones = require("../../utils/removeVietnameseTones");

// =========================
// GET /api/v1/manga/home
// (bản JSON của controllers/homeController.js -> exports.home)
// =========================
exports.home = async (req, res) => {
  try {
    const HOME_CARD_LIMIT = 24;

    const [mangas, topWeek, topMonth, topAll, romcomMangas, sliceOfLifeMangas] =
      await Promise.all([
        Manga.find({ status: "approved" })
          .sort({ lastUpdated: -1 })
          .limit(HOME_CARD_LIMIT)
          .lean(),
        Manga.find({ status: "approved" })
          .sort({ weeklyViews: -1 })
          .limit(HOME_CARD_LIMIT)
          .lean(),
        Manga.find({ status: "approved" })
          .sort({ monthlyViews: -1 })
          .limit(HOME_CARD_LIMIT)
          .lean(),
        Manga.find({ status: "approved" })
          .sort({ views: -1 })
          .limit(HOME_CARD_LIMIT)
          .lean(),
        Manga.find({
          status: "approved",
          genres: { $all: [/^romance$/i, /^comedy$/i] },
        })
          .sort({ lastUpdated: -1 })
          .limit(HOME_CARD_LIMIT)
          .lean(),
        Manga.find({
          status: "approved",
          genres: { $regex: /^(slice of life|đời thường)$/i },
        })
          .sort({ lastUpdated: -1 })
          .limit(HOME_CARD_LIMIT)
          .lean(),
      ]);

    const allMangas = [
      ...mangas,
      ...topWeek,
      ...topMonth,
      ...topAll,
      ...romcomMangas,
      ...sliceOfLifeMangas,
    ];
    const mangaIds = [
      ...new Map(
        allMangas.map((manga) => [String(manga._id), manga._id]),
      ).values(),
    ];

    if (mangaIds.length > 0) {
      const latestChapters = await Chapter.aggregate([
        { $match: { manga: { $in: mangaIds } } },
        { $sort: { manga: 1, chapterOrder: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$manga",
            chapterNumber: { $first: "$chapterNumber" },
            createdAt: { $first: "$createdAt" },
          },
        },
      ]);

      const latestMap = new Map(
        latestChapters.map((chapter) => [String(chapter._id), chapter]),
      );

      for (const manga of allMangas) {
        const latest = latestMap.get(String(manga._id));
        manga.lastChapter = latest?.chapterNumber || manga.lastChapter || "0";
        manga.lastChapterDate = latest?.createdAt || manga.createdAt;
      }
    }

    return res.json({
      success: true,
      mangas,
      topWeek,
      topMonth,
      topAll,
      romcomMangas,
      sliceOfLifeMangas,
    });
  } catch (err) {
    console.error("[api/manga/home]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =========================
// GET /api/v1/manga/search?q=...
// (bản JSON của mangaController.searchAjax, giữ nguyên logic normalize dấu)
// =========================
exports.search = async (req, res) => {
  try {
    const keyword = req.query.q || "";

    if (!keyword.trim()) {
      return res.json({ success: true, results: [] });
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const normalizedKeyword = removeVietnameseTones(keyword);

    const mangas = await Manga.find({
      titleNormalized: {
        $regex: escapeRegex(normalizedKeyword),
        $options: "i",
      },
      status: "approved",
    })
      .select("title slug cover")
      .limit(20);

    return res.json({ success: true, results: mangas });
  } catch (err) {
    console.error("[api/manga/search]", err);
    return res.json({ success: false, results: [] });
  }
};

// =========================
// GET /api/v1/manga/:slug
// (bản JSON của mangaController.showManga)
// =========================
exports.detail = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      status: "approved",
    })
      .populate(
        "translator",
        "username displayName avatar followedManga facebook",
      )
      .lean();

    if (!manga) {
      return res.status(404).json({ success: false, message: "Không tìm thấy truyện." });
    }

    let [chapters, mangaCount, chapterCommentCounts, totalComments, history, similarManga] =
      await Promise.all([
        Chapter.find({ manga: manga._id, isHidden: { $ne: true } })
          .select("-pages")
          .lean(),
        manga.translator
          ? Manga.countDocuments({
              translator: manga.translator._id,
              status: "approved",
            })
          : Promise.resolve(0),
        Comment.aggregate([
          { $match: { manga: manga._id, isHidden: { $ne: true } } },
          { $group: { _id: "$chapter", count: { $sum: 1 } } },
        ]),
        Comment.countDocuments({ manga: manga._id, isHidden: { $ne: true } }),
        req.user
          ? ReadingHistory.find({ user: req.user._id, manga: manga._id }).lean()
          : Promise.resolve([]),
        Manga.aggregate([
          {
            $match: {
              _id: { $ne: manga._id },
              status: "approved",
              genres: { $in: manga.genres },
            },
          },
          {
            $addFields: {
              commonTags: { $size: { $setIntersection: ["$genres", manga.genres] } },
            },
          },
          { $sort: { commonTags: -1, follows: -1, views: -1, updatedAt: -1 } },
          { $limit: 20 },
        ]),
      ]);

    manga.comments = totalComments;

    if (manga.translator) {
      manga.translator.mangaCount = mangaCount;
    }

    const commentCountMap = new Map(
      chapterCommentCounts.map((c) => [String(c._id), c.count]),
    );

    chapters = chapters
      .map((c) => ({
        ...c,
        commentCount: commentCountMap.get(String(c._id)) || 0,
        readProgress:
          history.find((h) => h.chapterNumber === c.chapterNumber)?.progress || 0,
      }))
      .sort((a, b) => (a.chapterOrder || 0) - (b.chapterOrder || 0));

    const isFollowing = req.user
      ? req.user.followedManga.some((id) => id.toString() === manga._id.toString())
      : false;

    return res.json({
      success: true,
      manga,
      chapters,
      similarManga,
      isFollowing,
    });
  } catch (err) {
    console.error("[api/manga/detail]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =========================
// GET /api/v1/manga/:slug/chapter/:number
// (bản JSON của mangaController.readChapter, giữ nguyên logic đếm view)
// =========================
exports.readChapter = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      status: "approved",
    }).lean();

    if (!manga) {
      return res.status(404).json({ success: false, message: "Không tìm thấy truyện." });
    }

    const chapterNumber = String(req.params.number);

    const [chapter, allChapters, historyDoc] = await Promise.all([
      Chapter.findOne({ manga: manga._id, chapterNumber }).lean(),
      Chapter.find({ manga: manga._id, isHidden: { $ne: true } })
        .select("-pages")
        .sort({ chapterOrder: 1 })
        .lean(),
      req.user
        ? ReadingHistory.findOne({
            user: req.user._id,
            manga: manga._id,
            chapterNumber,
          }).lean()
        : Promise.resolve(null),
    ]);

    if (!chapter) {
      return res.status(404).json({ success: false, message: "Không tìm thấy chương." });
    }

    if (chapter.isHidden) {
      return res.status(403).json({
        success: false,
        message: "Chương này đã bị ẩn do vi phạm quy định nội dung.",
      });
    }

    let pages = [];
    if (Array.isArray(chapter.pages)) {
      pages = chapter.pages
        .map((page) => {
          if (typeof page === "string") return page;
          if (page && typeof page === "object") return page.url;
          return "";
        })
        .filter(Boolean);
    }

    const currentIndex = allChapters.findIndex(
      (c) => c._id.toString() === chapter._id.toString(),
    );
    const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;
    const nextChapter =
      currentIndex < allChapters.length - 1 ? allChapters[currentIndex + 1] : null;

    // Đếm view: giữ đúng logic web (chỉ tính cho user đăng nhập, không
    // tính cho chủ truyện/người upload tự xem lại, chống trùng qua
    // unique index của ChapterView).
    let shouldCountView = false;
    const isOwnerOrUploader =
      req.user &&
      (req.user._id.toString() === manga.translator?.toString() ||
        req.user._id.toString() === chapter.uploadedBy?.toString());

    if (req.user && !isOwnerOrUploader) {
      try {
        await ChapterView.create({
          user: req.user._id,
          chapter: chapter._id,
          manga: manga._id,
        });
        shouldCountView = true;
      } catch (err) {
        if (err.code !== 11000) console.log(err);
        shouldCountView = false;
      }
    }

    if (shouldCountView) {
      try {
        await Promise.all([
          Manga.updateOne(
            { _id: manga._id },
            { $inc: { views: 1, weeklyViews: 1, monthlyViews: 1 } },
          ),
          Chapter.updateOne({ _id: chapter._id }, { $inc: { views: 1 } }),
        ]);
      } catch (viewErr) {
        console.error("[api/readChapter] Lỗi khi cộng view:", viewErr);
        await ChapterView.deleteOne({
          user: req.user._id,
          chapter: chapter._id,
        }).catch(() => {});
      }
    }

    return res.json({
      success: true,
      manga: { title: manga.title, slug: manga.slug, translator: manga.translator },
      chapter: { ...chapter, pages: undefined },
      pages,
      allChapters,
      prevChapter,
      nextChapter,
      savedScroll: historyDoc?.scrollPosition || 0,
      savedProgress: historyDoc?.progress || 0,
    });
  } catch (err) {
    console.error("[api/manga/readChapter]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =========================
// POST /api/v1/manga/:slug/follow  (yêu cầu requireAuth)
// (bản JSON của mangaController.toggleFollow)
// =========================
exports.toggleFollow = async (req, res) => {
  try {
    const manga = await Manga.findOne({ slug: req.params.slug });

    if (!manga) {
      return res.status(404).json({ success: false, message: "Không tìm thấy truyện." });
    }

    const mangaId = manga._id.toString();
    const index = req.user.followedManga.findIndex((id) => id.toString() === mangaId);

    let following = false;
    let showNotifPrompt = false;

    if (index === -1) {
      req.user.followedManga.push(manga._id);
      manga.follows = (manga.follows || 0) + 1;
      following = true;

      if (!req.user.hasSeenNotifPrompt) {
        req.user.hasSeenNotifPrompt = true;
        showNotifPrompt = true;
      }
    } else {
      req.user.followedManga.splice(index, 1);
      manga.follows = Math.max((manga.follows || 0) - 1, 0);
      following = false;
    }

    await req.user.save();
    await manga.save();

    return res.json({ success: true, following, follows: manga.follows, showNotifPrompt });
  } catch (err) {
    console.error("[api/manga/toggleFollow]", err);
    return res.status(500).json({ success: false });
  }
};

// =========================
// POST /api/v1/manga/history  (yêu cầu requireAuth)
// (bản JSON của mangaController.saveHistory — dùng để mobile app lưu
// tiến độ đọc/scroll y hệt web)
// =========================
exports.saveHistory = async (req, res) => {
  try {
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

    const oldHistory = await ReadingHistory.findOne({
      user: req.user._id,
      manga: mangaId,
      chapterNumber,
    });

    let finalProgress = progress;
    let finalScroll = scrollPosition;

    if (oldHistory) {
      finalProgress = Math.max(oldHistory.progress || 0, progress || 0);
      if (progress < oldHistory.progress) {
        finalScroll = oldHistory.scrollPosition || 0;
      }
    }

    await ReadingHistory.findOneAndUpdate(
      { user: req.user._id, manga: mangaId, chapterNumber },
      {
        manga: mangaId,
        mangaTitle,
        mangaSlug,
        cover,
        chapterNumber,
        chapterTitle,
        progress: finalProgress,
        scrollPosition: finalScroll,
        updatedAt: new Date(),
      },
      { upsert: true },
    );

    return res.json({ success: true });
  } catch (err) {
    console.error("[api/manga/saveHistory]", err);
    return res.status(500).json({ success: false });
  }
};

// =========================
// GET /api/v1/manga/history/list  (yêu cầu requireAuth)
// (bản JSON của mangaController.history)
// =========================
exports.historyList = async (req, res) => {
  try {
    const HISTORY_MANGA_LIMIT = 50;
    const CHAPTERS_PER_MANGA = 3;

    const grouped = await ReadingHistory.aggregate([
      { $match: { user: req.user._id } },
      { $sort: { updatedAt: -1 } },
      {
        $group: {
          _id: "$manga",
          mangaTitle: { $first: "$mangaTitle" },
          mangaSlug: { $first: "$mangaSlug" },
          cover: { $first: "$cover" },
          lastUpdatedAt: { $first: "$updatedAt" },
          chapters: {
            $push: {
              chapterNumber: "$chapterNumber",
              title: "$chapterTitle",
              progress: "$progress",
            },
          },
        },
      },
      { $sort: { lastUpdatedAt: -1 } },
      { $limit: HISTORY_MANGA_LIMIT },
      {
        $project: {
          _id: 0,
          manga: "$_id",
          mangaTitle: 1,
          mangaSlug: 1,
          cover: 1,
          lastUpdatedAt: 1,
          chapters: { $slice: ["$chapters", CHAPTERS_PER_MANGA] },
        },
      },
    ]);

    return res.json({ success: true, histories: grouped });
  } catch (err) {
    console.error("[api/manga/historyList]", err);
    return res.status(500).json({ success: false, histories: [] });
  }
};

// =========================
// GET /api/v1/manga/follow/list?page=1  (yêu cầu requireAuth)
// (bản JSON của profileController.followLibrary — dùng cho màn
// "Danh sách theo dõi" trên mobile app)
// =========================
exports.followList = async (req, res) => {
  try {
    const followedIds = req.user.followedManga || [];
    const limit = 24;
    const page = parseInt(req.query.page) || 1;

    const [totalMangas, mangas] = await Promise.all([
      Manga.countDocuments({ _id: { $in: followedIds } }),
      Manga.find({ _id: { $in: followedIds } })
        .sort({ lastUpdated: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    if (mangas.length > 0) {
      const mangaIds = mangas.map((m) => m._id);
      const latestChapters = await Chapter.aggregate([
        { $match: { manga: { $in: mangaIds } } },
        { $sort: { manga: 1, chapterOrder: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$manga",
            chapterNumber: { $first: "$chapterNumber" },
          },
        },
      ]);
      const latestMap = new Map(
        latestChapters.map((c) => [String(c._id), c.chapterNumber]),
      );
      for (const manga of mangas) {
        manga.lastChapter = latestMap.get(String(manga._id)) || manga.lastChapter || "0";
      }
    }

    return res.json({
      success: true,
      mangas,
      page,
      totalPages: Math.max(1, Math.ceil(totalMangas / limit)),
      totalMangas,
    });
  } catch (err) {
    console.error("[api/manga/followList]", err);
    return res.status(500).json({ success: false, mangas: [] });
  }
};

// =========================
// GET /api/v1/manga/list?genre=romance,comedy&page=1
// (bản JSON của route GET /manga trong routes/manga.js - lọc theo thể
// loại + phân trang, giữ đúng logic $all/regex như bản web)
// =========================
exports.list = async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    const limit = 24;

    const filter = { status: "approved" };

    if (req.query.genre) {
      const genreList = String(req.query.genre)
        .split(",")
        .map((g) => g.trim())
        .filter((g) => g !== "");

      if (genreList.length > 0) {
        filter.genres = {
          $all: genreList.map((g) => new RegExp(`^${g}$`, "i")),
        };
      }
    }

    const [totalMangas, mangas] = await Promise.all([
      Manga.countDocuments(filter),
      Manga.find(filter)
        .sort({ lastUpdated: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    if (mangas.length > 0) {
      const mangaIds = mangas.map((m) => m._id);
      const latestChapters = await Chapter.aggregate([
        { $match: { manga: { $in: mangaIds } } },
        { $sort: { manga: 1, chapterOrder: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$manga",
            chapterNumber: { $first: "$chapterNumber" },
          },
        },
      ]);
      const latestMap = new Map(
        latestChapters.map((c) => [String(c._id), c.chapterNumber]),
      );
      for (const manga of mangas) {
        manga.lastChapter = latestMap.get(String(manga._id)) || manga.lastChapter || "0";
      }
    }

    return res.json({
      success: true,
      mangas,
      page,
      totalPages: Math.max(1, Math.ceil(totalMangas / limit)),
      totalMangas,
    });
  } catch (err) {
    console.error("[api/manga/list]", err);
    return res.status(500).json({ success: false, mangas: [] });
  }
};

// =========================
// GET /api/v1/manga/genres
// (danh sách thể loại có thật trong DB, dùng cho màn "Thể loại" trên app)
// =========================
exports.genres = async (req, res) => {
  try {
    const genres = await Manga.distinct("genres", { status: "approved" });
    genres.sort((a, b) => a.localeCompare(b, "vi"));
    return res.json({ success: true, genres });
  } catch (err) {
    console.error("[api/manga/genres]", err);
    return res.status(500).json({ success: false, genres: [] });
  }
};

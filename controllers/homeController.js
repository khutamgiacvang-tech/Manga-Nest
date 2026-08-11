const Manga = require("../models/Manga");
const Chapter = require("../models/Chapter");

exports.home = async (req, res) => {
  try {
    // Số card hiển thị cho mỗi mục ở trang chủ
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
        // Romcom: có cả 2 thể loại romance + comedy. Truy vấn thẳng từ DB
        // (thay vì lọc trong mảng "mangas" 24 truyện mới nhất) để luôn
        // lấy đủ tới HOME_CARD_LIMIT truyện romcom nếu hệ thống có đủ.
        Manga.find({
          status: "approved",
          genres: { $all: [/^romance$/i, /^comedy$/i] },
        })
          .sort({ lastUpdated: -1 })
          .limit(HOME_CARD_LIMIT)
          .lean(),
        // Đời thường (slice of life)
        Manga.find({
          status: "approved",
          genres: { $regex: /^(slice of life|đời thường)$/i },
        })
          .sort({ lastUpdated: -1 })
          .limit(HOME_CARD_LIMIT)
          .lean(),
      ]);

    // Lấy chapter mới nhất của toàn bộ manga trong 1 query aggregate,
    // thay vì 1 query riêng cho từng card (tránh N+1 queries).
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

    res.render("home", {
      title: "MangaNest",
      mangas,
      topWeek,
      topMonth,
      topAll,
      romcomMangas,
      sliceOfLifeMangas,
    });
  } catch (err) {
    console.error("HOME ERROR:", err);

    res.render("home", {
      title: "MangaNest",
      mangas: [],
      topWeek: [],
      topMonth: [],
      topAll: [],
      romcomMangas: [],
      sliceOfLifeMangas: [],
    });
  }
};

exports.policy = (req, res) => {
  const tab = req.query.tab === "privacy" ? "privacy" : "terms";

  res.render("policy", {
    title: "Điều khoản & Chính sách - MangaNest",
    activeTab: tab,
  });
};

exports.support = (req, res) => {
  res.render("support", {
    title: "Ủng hộ - MangaNest",
  });
};

const Manga = require("../models/Manga");
const Chapter = require("../models/Chapter");

exports.home = async (req, res) => {
  try {
    const [mangas, topWeek, topMonth, topAll] = await Promise.all([
      Manga.find({ status: "approved" })
        .sort({ lastUpdated: -1 })
        .limit(12)
        .lean(),
      Manga.find({ status: "approved" })
        .sort({ weeklyViews: -1 })
        .limit(9)
        .lean(),
      Manga.find({ status: "approved" })
        .sort({ monthlyViews: -1 })
        .limit(9)
        .lean(),
      Manga.find({ status: "approved" })
        .sort({ views: -1 })
        .limit(9)
        .lean(),
    ]);

    // Lấy chapter mới nhất của toàn bộ manga trong 1 query aggregate,
    // thay vì 1 query riêng cho từng card (tránh N+1 queries).
    const allMangas = [...mangas, ...topWeek, ...topMonth, ...topAll];
    const mangaIds = [
      ...new Map(allMangas.map((manga) => [String(manga._id), manga._id])).values(),
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
    });
  } catch (err) {
    console.error("HOME ERROR:", err);

    res.render("home", {
      title: "MangaNest",
      mangas: [],
      topWeek: [],
      topMonth: [],
      topAll: [],
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

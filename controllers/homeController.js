const Manga = require("../models/Manga");
const Chapter = require("../models/Chapter");

exports.home = async (req, res) => {
  try {
    const mangas = await Manga.find({
      status: "approved",
    })
      .sort({ lastUpdated: -1 })
      .limit(12)
      .lean();

    for (const manga of mangas) {
      const chapters = await Chapter.find({
        manga: manga._id,
      }).lean();

      chapters.sort((a, b) => {
        const aNum = parseFloat(a.chapterNumber);
        const bNum = parseFloat(b.chapterNumber);

        const aIsNum = !isNaN(aNum);
        const bIsNum = !isNaN(bNum);

        if (aIsNum && bIsNum) return bNum - aNum;

        if (aIsNum && !bIsNum) return -1;
        if (!aIsNum && bIsNum) return 1;

        return String(b.chapterNumber).localeCompare(String(a.chapterNumber));
      });

      const latestChapter = chapters[0];

      manga.lastChapter = latestChapter?.chapterNumber || 0;

      manga.lastChapterDate = latestChapter?.createdAt || manga.createdAt;
    }

    const topWeek = await Manga.find({
      status: "approved",
    })
      .sort({ weeklyViews: -1 })
      .limit(9)
      .lean();

    const topMonth = await Manga.find({
      status: "approved",
    })
      .sort({ monthlyViews: -1 })
      .limit(9)
      .lean();

    const topAll = await Manga.find({
      status: "approved",
    })
      .sort({ views: -1 })
      .limit(9)
      .lean();

    const rankingLists = [topWeek, topMonth, topAll];

    for (const list of rankingLists) {
      for (const manga of list) {
        const latestChapter = await Chapter.findOne({
          manga: manga._id,
        })
          .sort({ chapterOrder: -1 })
          .lean();

        manga.lastChapter = latestChapter?.chapterNumber || 0;

        manga.lastChapterDate = latestChapter?.createdAt || manga.createdAt;
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
    console.log(err);

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

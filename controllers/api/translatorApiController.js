const TranslatorApplication = require("../../models/TranslatorApplication");
const User = require("../../models/User");
const Manga = require("../../models/Manga");
const Chapter = require("../../models/Chapter");
const Notification = require("../../models/Notification");
const { uploadBuffer } = require("../../utils/storageManager");

exports.myApplications = async (req, res) => {
  try {
    const applications = await TranslatorApplication.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    for (const application of applications) {
      application.projects = application.projects || [];
      application.profiles = application.profiles || [];
      application.sampleImages = (application.sampleImages || []).filter(
        (img) => typeof img === "string" && img.startsWith("http")
      );
    }

    return res.json({ success: true, applications });
  } catch (err) {
    console.error("[api/translator/applications]", err);
    return res.status(500).json({
      success: false,
      message: "Không thể tải các đơn Translator."
    });
  }
};

exports.myApplication = async (req, res) => {
  try {
    const application = await TranslatorApplication.findOne({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    if (application) {
      application.projects = application.projects || [];
      application.profiles = application.profiles || [];
      application.sampleImages = (application.sampleImages || []).filter(
        (img) => typeof img === "string" && img.startsWith("http")
      );
    }

    return res.json({ success: true, application: application || null });
  } catch (err) {
    console.error("[api/translator/application]", err);
    return res.status(500).json({
      success: false,
      message: "Không thể tải đơn Translator."
    });
  }
};

// =======================
// Gửi đơn xin Translator (bản JSON/multipart cho mobile, tương đương
// controllers/translatorController.js -> submitApplication)
// =======================
exports.submitApplication = async (req, res) => {
  try {
    if (req.user.role === "translator" || req.user.role === "admin") {
      return res.status(400).json({
        success: false,
        message: "Bạn đã có quyền Translator.",
      });
    }

    const { groupName, introduction, note } = req.body;

    if (!introduction || !introduction.trim()) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng giới thiệu bản thân.",
      });
    }

    const existed = await TranslatorApplication.findOne({
      user: req.user._id,
      status: "pending",
    });

    if (existed) {
      return res.status(409).json({
        success: false,
        message: "Bạn đang có một đơn Translator đang chờ Admin xét duyệt.",
      });
    }

    const projects = [];
    if (req.body.projectTitle) {
      const titles = Array.isArray(req.body.projectTitle) ? req.body.projectTitle : [req.body.projectTitle];
      const websites = Array.isArray(req.body.projectWebsite) ? req.body.projectWebsite : [req.body.projectWebsite];
      const links = Array.isArray(req.body.projectLink) ? req.body.projectLink : [req.body.projectLink];

      titles.forEach((title, index) => {
        if (title && title.trim() !== "") {
          projects.push({ title, website: websites[index], link: links[index] });
        }
      });
    }

    const profiles = [];
    if (req.body.profileWebsite) {
      const websites = Array.isArray(req.body.profileWebsite) ? req.body.profileWebsite : [req.body.profileWebsite];
      const links = Array.isArray(req.body.profileLink) ? req.body.profileLink : [req.body.profileLink];

      websites.forEach((website, index) => {
        if (website && website.trim() !== "") {
          profiles.push({ website, link: links[index] });
        }
      });
    }

    const sampleImages = [];
    if (req.files && req.files.length > 0) {
      for (const file of req.files) {
        const uploaded = await uploadBuffer(
          file.buffer,
          "manganest/translator-applications",
          file.originalname,
          { provider: "supabase" },
        );
        if (uploaded && typeof uploaded.url === "string") {
          sampleImages.push(uploaded.url);
        }
      }
    }

    const application = new TranslatorApplication({
      user: req.user._id,
      groupName,
      introduction,
      projects,
      profiles,
      sampleImages,
      note,
      status: "pending",
    });

    await application.save();

    const admins = await User.find({ role: "admin" });
    for (const admin of admins) {
      await Notification.create({
        user: admin._id,
        title: "📩 Đơn Translator mới",
        message: `${req.user.username} vừa gửi đơn xin Translator.`,
        link: "/admin",
        image: req.user.avatar || "/images/icon/avatar.png",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Đã gửi đơn xin cấp quyền Translator.",
      application,
    });
  } catch (err) {
    console.error("[api/translator/submitApplication]", err);
    return res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra, vui lòng thử lại sau.",
    });
  }
};

// =========================
// GET /api/v1/translator/profile/:username  (công khai)
// Trang nhóm dịch - bản JSON của translatorController.showProfile
// =========================
exports.profile = async (req, res) => {
  try {
    const translator = await User.findOne({ username: req.params.username })
      .select("username displayName avatar description facebook messenger")
      .lean();

    if (!translator) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhóm dịch." });
    }

    const PREVIEW = 6;
    const filter = { translator: translator._id, status: "approved" };

    const [newMangas, featuredMangas, totalCount] = await Promise.all([
      Manga.find(filter).sort({ createdAt: -1 }).limit(PREVIEW).lean(),
      Manga.find(filter).sort({ views: -1 }).limit(PREVIEW).lean(),
      Manga.countDocuments(filter),
    ]);

    await attachLastChapter([...newMangas, ...featuredMangas]);

    return res.json({ success: true, translator, newMangas, featuredMangas, totalCount });
  } catch (err) {
    console.error("[api/translator/profile]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =========================
// GET /api/v1/translator/profile/:username/mangas?sort=new|top&period=week|month|all&page=1
// Danh sách đầy đủ - Truyện mới / Truyện nổi bật của nhóm dịch
// =========================
exports.profileMangas = async (req, res) => {
  try {
    const translator = await User.findOne({ username: req.params.username })
      .select("_id")
      .lean();

    if (!translator) {
      return res.status(404).json({ success: false, message: "Không tìm thấy nhóm dịch." });
    }

    const PER_PAGE = 24;
    const page = Math.max(parseInt(req.query.page) || 1, 1);

    let sortOption = { lastUpdated: -1 };
    if (req.query.sort === "top") {
      const period = ["week", "month", "all"].includes(req.query.period)
        ? req.query.period
        : "week";
      const field =
        period === "week" ? "weeklyViews" : period === "month" ? "monthlyViews" : "views";
      sortOption = { [field]: -1 };
    }

    const filter = { translator: translator._id, status: "approved" };

    const [mangas, totalCount] = await Promise.all([
      Manga.find(filter)
        .sort(sortOption)
        .skip((page - 1) * PER_PAGE)
        .limit(PER_PAGE)
        .lean(),
      Manga.countDocuments(filter),
    ]);

    await attachLastChapter(mangas);

    return res.json({
      success: true,
      mangas,
      page,
      totalPages: Math.max(1, Math.ceil(totalCount / PER_PAGE)),
      totalCount,
    });
  } catch (err) {
    console.error("[api/translator/profileMangas]", err);
    return res.status(500).json({ success: false, mangas: [] });
  }
};

// Gắn chương mới nhất cho từng truyện (để GridMangaCard hiện "Ch.xx")
async function attachLastChapter(mangas) {
  if (!mangas.length) return;
  const ids = mangas.map((m) => m._id);
  const latest = await Chapter.aggregate([
    { $match: { manga: { $in: ids }, isHidden: { $ne: true }, isDeleted: { $ne: true } } },
    { $sort: { manga: 1, chapterOrder: -1, createdAt: -1 } },
    { $group: { _id: "$manga", chapterNumber: { $first: "$chapterNumber" } } },
  ]);
  const map = new Map(latest.map((c) => [String(c._id), c.chapterNumber]));
  for (const m of mangas) {
    m.lastChapter = map.get(String(m._id)) || m.lastChapter || "0";
  }
}

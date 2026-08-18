const TranslatorApplication = require("../models/TranslatorApplication");
const User = require("../models/User");
const Notification = require("../models/Notification");
const Manga = require("../models/Manga");
const { uploadBuffer } = require("../utils/storageManager");

const MANGAS_PER_PAGE = 24;
const PREVIEW_COUNT = 6;

// ===============================
// Helper: format thời gian
// ===============================

function timeAgoServer(date) {
  if (!date) return "";

  const now = new Date();
  const past = new Date(date);
  const diffMs = now - past;

  const seconds = Math.floor(diffMs / 1000);
  const minutes = Math.floor(seconds / 60);
  const hours = Math.floor(minutes / 60);
  const days = Math.floor(hours / 24);
  const months = Math.floor(days / 30);
  const years = Math.floor(days / 365);

  if (years > 0) return years + " năm trước";
  if (months > 0) return months + " tháng trước";
  if (days > 0) return days + " ngày trước";
  if (hours > 0) return hours + " giờ trước";
  if (minutes > 0) return minutes + " phút trước";
  return "vừa xong";
}

// ===============================
// Hiển thị trang xin quyền
// ===============================

exports.showApply = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      req.flash("error", "Vui lòng đăng nhập.");

      return res.redirect("/");
    }

    if (req.user.role === "translator") {
      return res.redirect("/upload");
    }

    const application = await TranslatorApplication.findOne({
      user: req.user._id,
    }).sort({
      createdAt: -1,
    });

    if (application) {
      if (application.status === "pending") {
        req.flash("error", "Bạn đã có đơn xin Translator đang chờ xét duyệt.");

        return res.redirect("/");
      }

      if (application.status === "approved") {
        req.flash("success", "Bạn đã là Translator.");

        return res.redirect("/upload");
      }
    }

    res.render("translator/apply", {
      title: "Đăng ký Translator",
    });
  } catch (err) {
    console.log(err);

    req.flash("error", "Có lỗi xảy ra.");

    res.redirect("/");
  }
};

// ===============================
// Gửi đơn xin Translator
// ===============================

exports.submitApplication = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      req.flash("error", "Vui lòng đăng nhập.");

      return res.redirect("/");
    }

    const { groupName, introduction, note } = req.body;

    const existed = await TranslatorApplication.findOne({
      user: req.user._id,

      status: "pending",
    });

    if (existed) {
      req.flash(
        "toast",
        JSON.stringify({
          type: "warning",
          message: "⚠ Bạn đang có một đơn Translator đang chờ Admin xét duyệt.",
        }),
      );

      return res.redirect("/");
    }

    const projects = [];

    if (req.body.projectTitle) {
      const titles = Array.isArray(req.body.projectTitle)
        ? req.body.projectTitle
        : [req.body.projectTitle];

      const websites = Array.isArray(req.body.projectWebsite)
        ? req.body.projectWebsite
        : [req.body.projectWebsite];

      const links = Array.isArray(req.body.projectLink)
        ? req.body.projectLink
        : [req.body.projectLink];

      titles.forEach((title, index) => {
        if (title.trim() !== "") {
          projects.push({
            title,

            website: websites[index],

            link: links[index],
          });
        }
      });
    }

    const profiles = [];

    if (req.body.profileWebsite) {
      const websites = Array.isArray(req.body.profileWebsite)
        ? req.body.profileWebsite
        : [req.body.profileWebsite];

      const links = Array.isArray(req.body.profileLink)
        ? req.body.profileLink
        : [req.body.profileLink];

      websites.forEach((website, index) => {
        if (website.trim() !== "") {
          profiles.push({
            website,

            link: links[index],
          });
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
        );

        // Đảm bảo chỉ push string URL, tránh lưu object vào DB
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

    const admins = await User.find({
      role: "admin",
    });

    for (const admin of admins) {
      await Notification.create({
        user: admin._id,

        title: "📩 Đơn Translator mới",

        message: `${req.user.username} vừa gửi đơn xin Translator.`,

        link: "/admin",
        image: "/images/icon/favicon.png",
      });
    }

    req.flash("success", "Đã gửi đơn xin cấp quyền Translator.");

    res.redirect("/translator/application");
  } catch (err) {
    console.log(err);

    req.flash("error", "Có lỗi xảy ra.");

    res.redirect("/translator/apply");
  }
};

// ===============================
// Xem đơn Translator của tôi
// ===============================

exports.myApplication = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      req.flash("error", "Vui lòng đăng nhập.");

      return res.redirect("/");
    }

    const application = await TranslatorApplication.findOne({
      user: req.user._id,
    })
      .sort({ createdAt: -1 })
      .lean();

    // Fallback cho doc cũ thiếu field + lọc bỏ URL lỗi (object, null, không phải http)
    if (application) {
      application.projects = application.projects || [];
      application.profiles = application.profiles || [];
      application.sampleImages = (application.sampleImages || []).filter(
        (img) => typeof img === "string" && img.startsWith("http"),
      );
    }

    res.render("translator/application", {
      title: "Đơn Translator",

      application,
    });
  } catch (err) {
    console.log(err);

    req.flash("error", "Có lỗi xảy ra.");

    res.redirect("/");
  }
};

// ===============================
// Trang Profile Translator (preview) - hỗ trợ cả render full page và AJAX
// ===============================

exports.showProfile = async (req, res) => {
  try {
    const translator = await User.findOne({
      username: req.params.username,
    });

    if (!translator) {
      return res.status(404).render("404");
    }

    const [newMangas, featuredMangas, totalCount] = await Promise.all([
      Manga.find({
        translator: translator._id,
        status: "approved",
      })
        .sort({ createdAt: -1 })
        .limit(PREVIEW_COUNT),

      Manga.find({
        translator: translator._id,
        status: "approved",
      })
        .sort({ views: -1 })
        .limit(PREVIEW_COUNT),

      Manga.countDocuments({
        translator: translator._id,
        status: "approved",
      }),
    ]);

    const contentData = {
      translator,
      newMangas,
      featuredMangas,
      totalCount,
      timeAgo: timeAgoServer,
    };

    const isAjax = req.headers["x-requested-with"] === "fetch";

    if (isAjax) {
      return req.app.render(
        "translator/partials/homeContent",
        contentData,
        (err, html) => {
          if (err) {
            console.log(err);
            return res.status(500).json({ error: "Có lỗi xảy ra." });
          }

          res.json({
            html,
            title: translator.displayName || translator.username,
            activeTab: "home",
            period: null,
            currentPage: 1,
            totalPages: 1,
          });
        },
      );
    }

    res.render("translator/profile", {
      title: translator.displayName || translator.username,
      translator,
      newMangas,
      featuredMangas,
      totalCount,
      activeTab: "home",
    });
  } catch (err) {
    console.log(err);

    req.flash("error", "Có lỗi xảy ra.");

    res.redirect("/");
  }
};

// ===============================
// Danh sách đầy đủ - Truyện mới
// ===============================

exports.showNewMangas = async (req, res) => {
  await renderMangaList(req, res, {
    sortOption: { lastUpdated: -1 },
    pageTitle: "Truyện mới",
    activeTab: "new",
  });
};

// ===============================
// Danh sách đầy đủ - Truyện nổi bật (có filter tuần/tháng/mọi lúc)
// ===============================

exports.showTopMangas = async (req, res) => {
  const period = ["week", "month", "all"].includes(req.query.period)
    ? req.query.period
    : "week";

  const sortField =
    period === "week"
      ? "weeklyViews"
      : period === "month"
        ? "monthlyViews"
        : "views";

  await renderMangaList(req, res, {
    sortOption: { [sortField]: -1 },
    pageTitle: "Truyện nổi bật",
    activeTab: "top",
    period,
  });
};

// ===============================
// Helper dùng chung - hỗ trợ cả render full page và AJAX
// ===============================

async function renderMangaList(
  req,
  res,
  { sortOption, pageTitle, activeTab, period },
) {
  try {
    const translator = await User.findOne({
      username: req.params.username,
    });

    if (!translator) {
      return res.status(404).render("404");
    }

    const currentPage = Math.max(parseInt(req.query.page) || 1, 1);

    const skip = (currentPage - 1) * MANGAS_PER_PAGE;

    const [mangas, totalCount] = await Promise.all([
      Manga.find({
        translator: translator._id,
        status: "approved",
      })
        .sort(sortOption)
        .skip(skip)
        .limit(MANGAS_PER_PAGE),

      Manga.countDocuments({
        translator: translator._id,
        status: "approved",
      }),
    ]);

    const totalPages = Math.max(Math.ceil(totalCount / MANGAS_PER_PAGE), 1);

    const contentData = {
      translator,
      mangas,
      pageTitle,
      activeTab,
      period: period || null,
      currentPage,
      totalPages,
      timeAgo: timeAgoServer,
    };

    const isAjax = req.headers["x-requested-with"] === "fetch";

    if (isAjax) {
      return req.app.render(
        "translator/partials/listContent",
        contentData,
        (err, html) => {
          if (err) {
            console.log(err);
            return res.status(500).json({ error: "Có lỗi xảy ra." });
          }

          res.json({
            html,
            title: `${pageTitle} - ${translator.displayName || translator.username}`,
            activeTab,
            period: period || null,
            currentPage,
            totalPages,
          });
        },
      );
    }

    res.render("translator/mangaList", {
      title: `${pageTitle} - ${translator.displayName || translator.username}`,
      translator,
      mangas,
      pageTitle,
      activeTab,
      period: period || null,
      currentPage,
      totalPages,
    });
  } catch (err) {
    console.log(err);

    if (req.headers["x-requested-with"] === "fetch") {
      return res.status(500).json({ error: "Có lỗi xảy ra." });
    }

    req.flash("error", "Có lỗi xảy ra.");

    res.redirect("/");
  }
}

const User = require("../models/User");
const TranslatorApplication = require("../models/TranslatorApplication");
const Notification = require("../models/Notification");
const Manga = require("../models/Manga");
const Comment = require("../models/Comment");
const Chapter = require("../models/Chapter");
const cloudinary = require("../config/cloudinary");
const { notifyUser } = require("../utils/moderationNotify");
const Category = require("../models/Category");

// =============================
// Middleware check Admin
// =============================

function checkAdmin(req, res) {
  if (!req.isAuthenticated()) {
    return false;
  }

  return req.user.role === "admin";
}

// =============================
// Dashboard
// =============================

exports.dashboard = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      req.flash("error", "Bạn không có quyền.");
      return res.redirect("/");
    }

    // ==========================
    // Đơn Translator
    // ==========================

    const pendingApplications = await TranslatorApplication.find({
      status: "pending",
    })
      .populate("user")
      .sort({ createdAt: -1 });

    const approvedApplications = await TranslatorApplication.find({
      status: "approved",
    })
      .populate("user")
      .sort({ updatedAt: -1 });

    const rejectedApplications = await TranslatorApplication.find({
      status: "rejected",
    })
      .populate("user")
      .sort({ updatedAt: -1 });

    // ==========================
    // Manga
    // ==========================

    const pendingMangas = await Manga.find({
      status: "pending",
    })
      .populate("translator")
      .sort({ createdAt: -1 });

    const approvedMangas = await Manga.find({
      status: "approved",
    })
      .populate("translator")
      .sort({ updatedAt: -1 });

    const rejectedMangas = await Manga.find({
      status: "rejected",
    })
      .populate("translator")
      .sort({ updatedAt: -1 });

    // ==========================
    // Gộp dữ liệu
    // ==========================

    const pendingItems = [
      ...pendingApplications.map((item) => ({
        type: "translator",
        data: item,
      })),
      ...pendingMangas.map((item) => ({
        type: "manga",
        data: item,
      })),
    ].sort((a, b) => b.data.createdAt - a.data.createdAt);

    const approvedItems = [
      ...approvedApplications.map((item) => ({
        type: "translator",
        data: item,
      })),
      ...approvedMangas.map((item) => ({
        type: "manga",
        data: item,
      })),
    ].sort((a, b) => b.data.updatedAt - a.data.updatedAt);

    const rejectedItems = [
      ...rejectedApplications.map((item) => ({
        type: "translator",
        data: item,
      })),
      ...rejectedMangas.map((item) => ({
        type: "manga",
        data: item,
      })),
    ].sort((a, b) => b.data.updatedAt - a.data.updatedAt);

    // ==========================
    // Biểu đồ 1: Tổng tài khoản
    // ==========================

    const totalUsers = await User.countDocuments({ role: "user" });
    const totalTranslators = await User.countDocuments({ role: "translator" });
    const totalAdmins = await User.countDocuments({ role: "admin" });

    // ==========================
    // Biểu đồ 2: Truyện theo thể loại
    // ==========================
    //
    // LƯU Ý: trước đây filter status:"approved" + limit 8 khiến thể loại
    // mới thêm (gắn vào truyện vừa đăng, còn đang chờ duyệt, hoặc thể
    // loại hiếm chỉ có 1-2 truyện) không bao giờ xuất hiện trên biểu đồ,
    // gây cảm giác "không đồng nhất" với danh sách ở mục Quản lý thể loại.
    // Đổi sang: tính luôn cả truyện đang chờ duyệt (chỉ loại truyện đã bị
    // từ chối), và bỏ giới hạn limit 8 để không bị cắt bớt thể loại.

    const genreAgg = await Manga.aggregate([
      { $match: { status: { $ne: "rejected" } } },
      { $unwind: "$genres" },
      { $group: { _id: "$genres", count: { $sum: 1 } } },
      { $sort: { count: -1 } },
    ]);

    const genreLabels = genreAgg.map((g) => g._id);
    const genreCounts = genreAgg.map((g) => g.count);

    // ==========================
    // Khu quản lý User / Translator
    // ==========================

    const allUsers = await User.find({ role: "user" })
      .sort({ createdAt: -1 })
      .lean();

    const allTranslators = await User.find({ role: "translator" })
      .sort({ createdAt: -1 })
      .lean();

    // ==========================
    // Nhật ký bình luận (quản lý / kiểm duyệt)
    // ==========================

    const recentComments = await Comment.find({})
      .populate("user", "username displayName avatar")
      .populate("manga", "title slug")
      .populate("chapter", "chapterNumber")
      .sort({ createdAt: -1 })
      .limit(750)
      .lean();

    // ==========================
    // Nhật ký chương truyện (quản lý / kiểm duyệt)
    // ==========================

    const recentChapters = await Chapter.find({})
      .populate("manga", "title slug cover")
      .populate("uploadedBy", "username displayName")
      .sort({ createdAt: -1 })
      .limit(500)
      .lean();

    const categories = await Category.find().sort({ name: 1 }).lean();

    res.render("admin/dashboard", {
      title: "Admin Dashboard",

      pendingApplications: pendingItems,
      approvedApplications: approvedItems,
      rejectedApplications: rejectedItems,

      pendingCount: pendingItems.length,
      approvedCount: approvedItems.length,
      rejectedCount: rejectedItems.length,

      totalUsers,
      totalTranslators,
      totalAdmins,

      genreLabels,
      genreCounts,

      allUsers,
      allTranslators,

      recentComments,
      recentChapters,

      categories,
    });
  } catch (err) {
    console.log(err);

    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/");
  }
};

// =======================================
// Lấy chi tiết đơn (AJAX)
// =======================================

exports.getApplication = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const application = await TranslatorApplication.findById(
      req.params.id,
    ).populate("user");

    if (!application) {
      return res.status(404).json({
        success: false,
      });
    }

    res.json({
      success: true,

      application,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

// =======================================
// Lấy chi tiết truyện (AJAX)
// =======================================

exports.getManga = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const manga = await Manga.findById(req.params.id).populate("translator");

    if (!manga) {
      return res.status(404).json({
        success: false,
      });
    }

    res.json({
      success: true,
      manga,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

// =======================================
// Approve
// =======================================

exports.approveApplication = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const application = await TranslatorApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,

        message: "Không tìm thấy đơn.",
      });
    }

    if (application.status !== "pending") {
      return res.json({
        success: false,

        message: "Đơn đã xử lý.",
      });
    }

    application.status = "approved";

    await application.save();

    await User.findByIdAndUpdate(
      application.user,

      {
        role: "translator",
      },
    );

    await Notification.create({
      user: application.user,

      title: "🎉 Đơn Translator",

      message: "Đơn của bạn đã được chấp nhận.",

      link: "/profile",

      image: "/images/icon/favicon.png",
    });

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

// =======================================
// Reject
// =======================================

exports.rejectApplication = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const application = await TranslatorApplication.findById(req.params.id);

    if (!application) {
      return res.status(404).json({
        success: false,
      });
    }

    if (application.status !== "pending") {
      return res.json({
        success: false,
      });
    }

    application.status = "rejected";

    await application.save();

    await Notification.create({
      user: application.user,

      title: "❌ Đơn Translator",

      message: "Đơn của bạn đã bị từ chối.",

      link: "/translator/application",

      image: "/images/icon/favicon.png",
    });

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

// =======================================
// Approve Manga
// =======================================

exports.approveManga = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const manga = await Manga.findById(req.params.id);

    if (!manga) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy truyện.",
      });
    }

    if (manga.status !== "pending") {
      return res.json({
        success: false,
        message: "Truyện đã được xử lý.",
      });
    }

    manga.status = "approved";

    await manga.save();

    if (manga.translator) {
      await Notification.create({
        user: manga.translator,

        title: "📖 Truyện được duyệt",

        message: `Truyện "${manga.title}" đã được Admin duyệt.`,

        link: `/manga/${manga.slug}`,

        image: manga.cover,
      });
    }

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

// =======================================
// Reject Manga
// =======================================

exports.rejectManga = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const manga = await Manga.findById(req.params.id);

    if (!manga) {
      return res.status(404).json({
        success: false,
      });
    }

    if (manga.status !== "pending") {
      return res.json({
        success: false,
      });
    }

    manga.status = "rejected";

    await manga.save();

    if (manga.translator) {
      await Notification.create({
        user: manga.translator,

        title: "❌ Truyện bị từ chối",

        message: `Truyện "${manga.title}" đã bị Admin từ chối.`,

        link: "/translator/dashboard",

        image: manga.cover,
      });
    }

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

// =======================================
// Khóa / Mở khóa (giữ để tương thích code cũ)
// =======================================

exports.toggleLockUser = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({ success: false });
    }

    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản.",
      });
    }

    if (targetUser.role === "admin") {
      return res.json({
        success: false,
        message: "Không thể khóa Admin.",
      });
    }

    targetUser.status = targetUser.status === "banned" ? "active" : "banned";

    await targetUser.save();

    res.json({
      success: true,
      status: targetUser.status,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

// =======================================
// Ban User / Translator
// =======================================

exports.banUser = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản.",
      });
    }

    if (user.role === "admin") {
      return res.json({
        success: false,
        message: "Không thể ban Admin.",
      });
    }

    // Frontend gửi { days, reason } — days = "-1" nghĩa là ban vĩnh viễn
    const { days, reason } = req.body;

    user.status = "banned";
    user.banReason = reason || "Không có.";

    const daysNumber = Number(days);

    if (daysNumber === -1) {
      user.isPermanentBan = true;
      user.banUntil = null;
    } else {
      user.isPermanentBan = false;

      const validDays = daysNumber > 0 ? daysNumber : 7; // mặc định 7 ngày nếu giá trị không hợp lệ
      const banUntilDate = new Date();
      banUntilDate.setDate(banUntilDate.getDate() + validDays);

      user.banUntil = banUntilDate;
    }

    await user.save();

    res.json({
      success: true,
      message: "Đã khóa tài khoản.",
      status: user.status,
      isPermanentBan: user.isPermanentBan,
      banUntil: user.banUntil,
      banReason: user.banReason,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

// =======================================
// Mở khóa User / Translator
// =======================================

exports.unbanUser = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản.",
      });
    }

    user.status = "active";
    user.isPermanentBan = false;
    user.banUntil = null;
    user.banReason = "";

    await user.save();

    res.json({
      success: true,
      message: "Đã mở khóa tài khoản.",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

// =======================================
// Xóa tài khoản
// =======================================

exports.deleteUser = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const targetUser = await User.findById(req.params.id);

    if (!targetUser) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy tài khoản.",
      });
    }

    if (targetUser.role === "admin") {
      return res.json({
        success: false,
        message: "Không thể xóa Admin.",
      });
    }

    await User.findByIdAndDelete(req.params.id);

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

// =======================================
// Khôi phục tài khoản (nếu còn dùng)
// =======================================

exports.restoreUser = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const user = await User.findById(req.params.id);

    if (!user) {
      return res.status(404).json({
        success: false,
      });
    }

    user.status = "active";
    user.deletedAt = null;

    await user.save();

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
    });
  }
};

// =======================================
// Ẩn / Hiện bình luận (kiểm duyệt)
// =======================================

exports.toggleHideComment = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const comment = await Comment.findById(req.params.id).populate(
      "manga",
      "title slug cover",
    );

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bình luận.",
      });
    }

    comment.isHidden = !comment.isHidden;

    if (comment.isHidden) {
      comment.hiddenReason =
        (req.body && req.body.reason) || "Vi phạm quy định nội dung.";
    } else {
      comment.hiddenReason = "";
    }

    await comment.save();

    // =========================
    // Thông báo cho user bị ẩn bình luận
    // =========================

    if (comment.isHidden && comment.user) {
      const mangaTitle = comment.manga ? comment.manga.title : "truyện";
      const mangaLink = comment.manga ? `/manga/${comment.manga.slug}` : "#";
      const mangaCover = comment.manga ? comment.manga.cover : "";

      await notifyUser({
        userId: comment.user,
        title: "🚫 Bình luận của bạn đã bị ẩn",
        message: `Bình luận của bạn trên "${mangaTitle}" đã bị Admin ẩn. Lý do: ${comment.hiddenReason}`,
        link: mangaLink,
        image: mangaCover,
      });
    }

    res.json({
      success: true,
      isHidden: comment.isHidden,
      message: comment.isHidden ? "Đã ẩn bình luận." : "Đã hiện lại bình luận.",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

// =======================================
// Ẩn / Hiện chương truyện (kiểm duyệt)
// =======================================

exports.toggleHideChapter = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const chapter = await Chapter.findById(req.params.id).populate(
      "manga",
      "title slug cover",
    );

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy chương.",
      });
    }

    chapter.isHidden = !chapter.isHidden;

    if (!chapter.isHidden) {
      chapter.hiddenReason = "";
    } else {
      chapter.hiddenReason =
        (req.body && req.body.reason) || "Vi phạm quy định nội dung.";
    }

    await chapter.save();

    // =========================
    // Thông báo cho translator
    // =========================

    if (chapter.uploadedBy) {
      const mangaTitle = chapter.manga ? chapter.manga.title : "truyện";
      const mangaSlug = chapter.manga ? chapter.manga.slug : "";
      const mangaCover = chapter.manga ? chapter.manga.cover : "";
      const statusLink = mangaSlug
        ? `/my-manga/${mangaSlug}/chapter/${chapter._id}/status`
        : "#";

      if (chapter.isHidden) {
        await notifyUser({
          userId: chapter.uploadedBy,
          title: "🚫 Chương truyện của bạn đã bị ẩn",
          message: `Chương ${chapter.chapterNumber} của "${mangaTitle}" đã bị Admin ẩn. Nhấn để xem lý do và chỉnh sửa.`,
          link: statusLink,
          image: mangaCover,
        });
      } else {
        await notifyUser({
          userId: chapter.uploadedBy,
          title: "✅ Chương truyện của bạn đã được hiện lại",
          message: `Chương ${chapter.chapterNumber} của "${mangaTitle}" đã được Admin hiện lại, mọi người có thể đọc bình thường.`,
          link: mangaSlug ? `/manga/${mangaSlug}` : "#",
          image: mangaCover,
        });
      }
    }

    res.json({
      success: true,
      isHidden: chapter.isHidden,
      message: chapter.isHidden ? "Đã ẩn chương." : "Đã hiện lại chương.",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

// =======================================
// Xóa chương truyện (Admin - vi phạm nội dung)
// =======================================

exports.deleteChapterAdmin = async (req, res) => {
  try {
    if (!checkAdmin(req, res)) {
      return res.status(403).json({
        success: false,
      });
    }

    const chapter = await Chapter.findById(req.params.id);

    if (!chapter) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy chương.",
      });
    }

    const manga = await Manga.findById(chapter.manga);

    // =========================
    // Xóa ảnh trên Cloudinary
    // =========================

    if (manga) {
      try {
        await cloudinary.api.delete_resources_by_prefix(
          `manganest/chapters/${manga.slug}/${chapter.chapterNumber}`,
        );

        await cloudinary.api.delete_folder(
          `manganest/chapters/${manga.slug}/${chapter.chapterNumber}`,
        );
      } catch (err) {
        console.log("Cloudinary:", err.message);
      }
    }

    // =========================
    // Soft-delete: giữ lại bản ghi để translator vẫn thấy
    // chương đã bị xóa + lý do trong trang quản lý của họ
    // =========================

    const reason =
      (req.body && req.body.reason) || "Vi phạm quy định nội dung.";

    chapter.pages = [];
    chapter.isHidden = true;
    chapter.isDeleted = true;
    chapter.hiddenReason = reason;
    chapter.deletedAt = new Date();

    await chapter.save();

    // =========================
    // Cập nhật lại Manga (không tính chương đã ẩn/xóa)
    // =========================

    if (manga) {
      manga.totalChapters = await Chapter.countDocuments({
        manga: manga._id,
        isHidden: { $ne: true },
      });

      const lastChapter = await Chapter.find({
        manga: manga._id,
        isHidden: { $ne: true },
      })
        .sort({ chapterOrder: -1 })
        .limit(1);

      manga.lastChapter =
        lastChapter.length > 0 ? lastChapter[0].chapterNumber : "0";

      manga.lastUpdated = new Date();

      await manga.save();
    }

    // =========================
    // Thông báo cho translator
    // =========================

    if (chapter.uploadedBy) {
      const mangaTitle = manga ? manga.title : "truyện";
      const mangaSlug = manga ? manga.slug : "";
      const mangaCover = manga ? manga.cover : "";
      const statusLink = mangaSlug
        ? `/my-manga/${mangaSlug}/chapter/${chapter._id}/status`
        : "#";

      await notifyUser({
        userId: chapter.uploadedBy,
        title: "🗑 Chương truyện của bạn đã bị xóa",
        message: `Chương ${chapter.chapterNumber} của "${mangaTitle}" đã bị Admin xóa. Nhấn để xem lý do.`,
        link: statusLink,
        image: mangaCover,
      });
    }

    res.json({
      success: true,
      message: "Đã xóa chương.",
    });
  } catch (err) {
    console.log(err);

    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

const Comment = require("../models/Comment");
const Manga = require("../models/Manga");
const Chapter = require("../models/Chapter");
const { notifyUser } = require("../utils/moderationNotify");

function timeAgo(date) {
  const now = new Date();
  const diffMs = now - new Date(date);

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

// =========================
// Lấy danh sách bình luận theo Manga
// =========================

exports.getComments = async (req, res) => {
  try {
    const manga = await Manga.findOne({ slug: req.params.slug });

    if (!manga) {
      return res.status(404).json({ success: false });
    }

    const chapter = await Chapter.findOne({
      manga: manga._id,
      chapterNumber: req.params.chapterNumber,
    });

    if (!chapter) {
      return res.status(404).json({ success: false });
    }

    const comments = await Comment.find({
      chapter: chapter._id,
      isHidden: { $ne: true },
    })
      .populate("user", "username displayName avatar")
      .sort({ createdAt: -1 });

    const data = comments.map((c) => {
      const isOwner =
        req.isAuthenticated() &&
        c.user &&
        c.user._id.toString() === req.user._id.toString();

      const isAdmin = req.isAuthenticated() && req.user.role === "admin";

      return {
        _id: c._id,
        content: c.content,
        username: c.user
          ? c.user.displayName || c.user.username
          : "Người dùng ẩn danh",
        avatar: c.user?.avatar || "/images/icon/avatar.png",
        timeAgo: timeAgo(c.createdAt),
        isEdited: c.isEdited,

        // phục vụ frontend
        canDelete: isOwner || isAdmin,
        canEdit: isOwner,
      };
    });

    res.json({
      success: true,
      comments: data,
      total: data.length,
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
};

// =========================
// Gửi bình luận mới
// =========================

exports.postComment = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "Vui lòng đăng nhập để bình luận.",
      });
    }

    const manga = await Manga.findOne({ slug: req.params.slug });

    if (!manga) {
      return res.status(404).json({ success: false });
    }

    const chapter = await Chapter.findOne({
      manga: manga._id,
      chapterNumber: req.params.chapterNumber,
    });

    if (!chapter) {
      return res.status(404).json({ success: false });
    }

    const content = (req.body.content || "").trim();

    if (!content) {
      return res.json({
        success: false,
        message: "Nội dung bình luận không được để trống.",
      });
    }

    if (content.length > 1000) {
      return res.json({
        success: false,
        message: "Bình luận quá dài.",
      });
    }

    const comment = await Comment.create({
      manga: manga._id,
      chapter: chapter._id,
      user: req.user._id,
      content,
    });

    manga.comments = (manga.comments || 0) + 1;
    await manga.save();

    res.json({
      success: true,
      comment: {
        _id: comment._id,
        content: comment.content,
        username: req.user.displayName || req.user.username,
        avatar: req.user.avatar || "/images/icon/avatar.png",
        timeAgo: "vừa xong",
        isEdited: false,

        // comment vừa tạo luôn có quyền xóa/sửa
        canDelete: true,
        canEdit: true,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({ success: false });
  }
};

// =========================
// Sửa bình luận
// =========================

exports.updateComment = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "Vui lòng đăng nhập.",
      });
    }

    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bình luận.",
      });
    }

    const isOwner = comment.user.toString() === req.user._id.toString();

    if (!isOwner) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền sửa bình luận này.",
      });
    }

    const content = (req.body.content || "").trim();

    if (!content) {
      return res.json({
        success: false,
        message: "Nội dung bình luận không được để trống.",
      });
    }

    if (content.length > 1000) {
      return res.json({
        success: false,
        message: "Bình luận quá dài.",
      });
    }

    comment.content = content;
    comment.isEdited = true;

    await comment.save();

    res.json({
      success: true,
      comment: {
        _id: comment._id,
        content: comment.content,
        isEdited: true,
      },
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

// =========================
// Xóa bình luận
// =========================

exports.deleteComment = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.status(401).json({
        success: false,
        message: "Vui lòng đăng nhập.",
      });
    }

    const comment = await Comment.findById(req.params.id);

    if (!comment) {
      return res.status(404).json({
        success: false,
        message: "Không tìm thấy bình luận.",
      });
    }

    const isOwner = comment.user.toString() === req.user._id.toString();

    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      return res.status(403).json({
        success: false,
        message: "Bạn không có quyền xóa bình luận này.",
      });
    }

    // =========================
    // Nếu admin xóa bình luận của người khác -> thông báo lý do
    // =========================

    if (isAdmin && !isOwner) {
      const reason =
        (req.body && req.body.reason) || "Vi phạm quy định nội dung.";

      const manga = await Manga.findById(comment.manga).select(
        "title slug cover",
      );

      const chapterDoc = await Chapter.findById(comment.chapter).select(
        "chapterNumber",
      );

      const link =
        manga && chapterDoc
          ? `/manga/${manga.slug}/chapter/${chapterDoc.chapterNumber}`
          : manga
            ? `/manga/${manga.slug}`
            : "#";

      await notifyUser({
        userId: comment.user,
        title: "🗑 Bình luận của bạn đã bị xóa",
        message: `Bình luận của bạn trên "${manga ? manga.title : "truyện"}" đã bị Admin xóa. Lý do: ${reason}`,
        link,
        image: manga ? manga.cover : "",
      });
    }

    await comment.deleteOne();

    const mangaDoc = await Manga.findById(comment.manga);

    if (mangaDoc) {
      mangaDoc.comments = Math.max((mangaDoc.comments || 0) - 1, 0);
      await mangaDoc.save();
    }

    res.json({
      success: true,
      message: "Đã xóa bình luận.",
    });
  } catch (err) {
    console.log(err);
    res.status(500).json({
      success: false,
      message: "Có lỗi xảy ra.",
    });
  }
};

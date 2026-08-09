const mongoose = require("mongoose");

// =========================
// Ghi lại: tài khoản X đã xem chương Y chưa
// Dùng để chỉ tính 1 view / tài khoản / chương,
// không phụ thuộc session (tránh bị tăng view ảo
// khi session hết hạn, đổi trình duyệt/thiết bị...).
// =========================

const chapterViewSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: true,
    },

    manga: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manga",
      required: true,
    },
  },
  {
    timestamps: true,
  },
);

// Mỗi tài khoản chỉ có 1 bản ghi cho mỗi chương
chapterViewSchema.index({ user: 1, chapter: 1 }, { unique: true });

module.exports = mongoose.model("ChapterView", chapterViewSchema);

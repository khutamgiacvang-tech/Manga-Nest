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

// Phục vụ tính BXH tuần/tháng: aggregate theo manga trong 1 khoảng
// thời gian (7 ngày / 30 ngày gần nhất) -> cần index theo đúng 2 field
// dùng để $match + $group, nếu không mỗi lần tính BXH sẽ phải quét
// toàn bộ collection ChapterView.
chapterViewSchema.index({ manga: 1, createdAt: 1 });

module.exports = mongoose.model("ChapterView", chapterViewSchema);

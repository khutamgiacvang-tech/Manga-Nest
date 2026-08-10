const mongoose = require("mongoose");

const chapterSchema = new mongoose.Schema(
  {
    // =========================
    // Manga
    // =========================
    manga: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manga",
      required: true,
      index: true,
    },

    // =========================
    // Số chapter
    // =========================
    chapterNumber: {
      type: String,
      required: true,
      trim: true,
    },

    chapterOrder: {
      type: Number,
      default: 0,
    },

    // =========================
    // Tiêu đề
    // =========================
    title: {
      type: String,
      default: "Không có tiêu đề",
    },

    // =========================
    // Danh sách ảnh Cloudinary
    // =========================
    pages: [
      {
        url: String,
        public_id: String,
      },
    ],

    // =========================
    // Tổng số trang
    // =========================
    totalPages: {
      type: Number,
      default: 0,
    },

    // =========================
    // Lượt xem
    // =========================
    views: {
      type: Number,
      default: 0,
    },

    // =========================
    // Người upload
    // =========================
    uploadedBy: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    // =========================
    // Kiểm duyệt (Admin ẩn chương vi phạm)
    // =========================
    isHidden: {
      type: Boolean,
      default: false,
    },

    hiddenReason: {
      type: String,
      default: "",
    },

    // =========================
    // Admin xóa chương (soft-delete để translator vẫn thấy được lịch sử + lý do)
    // =========================
    isDeleted: {
      type: Boolean,
      default: false,
    },

    deletedAt: {
      type: Date,
      default: null,
    },
  },
  {
    timestamps: true,
  },
);

chapterSchema.index(
  {
    manga: 1,
    chapterNumber: 1,
  },
  {
    unique: true,
  },
);

// Tối ưu lấy chapter mới nhất theo từng manga.
chapterSchema.index({ manga: 1, chapterOrder: -1, createdAt: -1 });

module.exports = mongoose.model("Chapter", chapterSchema);

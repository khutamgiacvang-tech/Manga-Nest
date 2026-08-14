const mongoose = require("mongoose");
const removeVietnameseTones = require("../utils/removeVietnameseTones");

const mangaSchema = new mongoose.Schema(
  {
    // =========================
    // Thông tin cơ bản
    // =========================

    title: {
      type: String,

      required: true,

      trim: true,
    },

    // Tên không dấu, tự sinh từ "title" -> phục vụ tìm kiếm không cần gõ dấu
    titleNormalized: {
      type: String,
      default: "",
      index: true,
    },

    alternativeTitles: [
      {
        type: String,

        trim: true,
      },
    ],

    slug: {
      type: String,

      required: true,

      unique: true,

      index: true,
    },

    description: {
      type: String,

      default: "",
    },

    // =========================
    // Ảnh
    // =========================

    cover: {
      type: String,
      default: "",
    },

    coverPublicId: {
      type: String,
      default: "",
    },

    banner: {
      type: String,
      default: "",
    },

    bannerPublicId: {
      type: String,
      default: "",
    },

    // =========================
    // Thông tin tác giả
    // =========================

    author: {
      type: String,

      required: true,

      trim: true,
    },

    // =========================
    // Thể loại
    // =========================

    genres: [
      {
        type: String,

        trim: true,
      },
    ],

    // =========================
    // Trạng thái truyện
    // =========================

    status: {
      type: String,

      enum: ["pending", "approved", "rejected", "hidden"],

      default: "pending",
    },

    // =========================
    // Trạng thái nội dung
    // =========================

    publishStatus: {
      type: String,

      enum: ["ongoing", "completed", "hiatus"],

      default: "ongoing",
    },

    // =========================
    // Translator
    // =========================

    translator: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    // =========================
    // Admin
    // =========================

    approvedBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      default: null,
    },

    approvedAt: {
      type: Date,

      default: null,
    },

    rejectReason: {
      type: String,

      default: "",
    },

    // =========================
    // Thống kê
    // =========================

    views: {
      type: Number,
      default: 0,
    },

    weeklyViews: {
      type: Number,
      default: 0,
    },

    monthlyViews: {
      type: Number,
      default: 0,
    },

    follows: {
      type: Number,

      default: 0,
    },

    rating: {
      type: Number,

      default: 0,
    },

    totalRatings: {
      type: Number,

      default: 0,
    },

    comments: {
      type: Number,
      default: 0,
    },

    bookmarks: {
      type: Number,
      default: 0,
    },

    totalChapters: {
      type: Number,
      default: 0,
    },

    // =========================
    // Chapter mới nhất
    // =========================

    lastChapter: {
      type: String,
      default: "0",
    },

    lastUpdated: {
      type: Date,

      default: Date.now,
    },
  },
  {
    timestamps: true,
  },
);

// Tự động tạo/ cập nhật titleNormalized mỗi khi title thay đổi
mangaSchema.pre("save", function () {
  if (this.isModified("title")) {
    this.titleNormalized = removeVietnameseTones(this.title);
  }
});

module.exports = mongoose.model("Manga", mangaSchema);

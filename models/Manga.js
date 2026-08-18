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

    // weeklyViews/monthlyViews KHÔNG được cộng trực tiếp mỗi khi có 1 view
    // mới nữa. Chúng được TÍNH LẠI ĐỊNH KỲ (xem utils/viewsRollupScheduler.js)
    // bằng cách đếm số bản ghi ChapterView có createdAt nằm trong 7 ngày /
    // 30 ngày gần nhất, group theo manga. Đây là cách tính kiểu "cửa sổ
    // trượt" (rolling window) -> số liệu luôn đúng với ĐÚNG khoảng thời
    // gian gần nhất, không cần "reset" ở 1 mốc cố định (đầu tuần/đầu
    // tháng) nên không bao giờ bị nhảy cục về 0 khi sang tuần/tháng mới.
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

// =========================
// Index tối ưu hiệu suất
// =========================
// Hầu hết query đều lọc status:"approved" trước rồi mới sort theo 1
// trong các field views/weeklyViews/monthlyViews/lastUpdated (trang chủ,
// trang chi tiết truyện, bảng xếp hạng translator...). Không có các
// compound index này thì MỖI query đều phải quét toàn bộ collection
// rồi sort trong RAM -> đây là nguyên nhân lớn khiến trang chủ và
// trang chi tiết truyện load chậm khi số lượng manga tăng lên.
mangaSchema.index({ status: 1, lastUpdated: -1 });
mangaSchema.index({ status: 1, views: -1 });
mangaSchema.index({ status: 1, weeklyViews: -1 });
mangaSchema.index({ status: 1, monthlyViews: -1 });
mangaSchema.index({ status: 1, follows: -1 });

// Phục vụ query lọc theo thể loại (romcom, đời thường ở trang chủ,
// và "truyện tương tự" ở trang chi tiết).
mangaSchema.index({ status: 1, genres: 1 });

// Phục vụ đếm/liệt kê truyện theo dịch giả (trang "Truyện của tôi",
// trang quản lý của translator).
mangaSchema.index({ translator: 1, status: 1 });

module.exports = mongoose.model("Manga", mangaSchema);

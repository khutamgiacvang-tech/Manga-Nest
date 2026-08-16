const mongoose = require("mongoose");

const translatorApplicationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    groupName: {
      type: String,
      default: "",
    },

    introduction: {
      type: String,
      required: true,
    },

    projects: [
      {
        title: String,
        website: String,
        link: String,
      },
    ],

    profiles: [
      {
        website: String,
        link: String,
      },
    ],

    // =========================
    // Ảnh mẫu (Cloudinary) - mảng URL string
    // =========================

    sampleImages: [
      {
        type: String,
      },
    ],

    note: {
      type: String,
      default: "",
    },

    status: {
      type: String,
      enum: ["pending", "approved", "rejected"],
      default: "pending",
    },

    adminNote: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// Phục vụ trang Admin Dashboard: lọc theo status rồi sort theo createdAt
// (tab "Đang chờ") hoặc updatedAt (tab "Đã duyệt"/"Đã từ chối"). Thiếu
// các index compound này khiến mỗi query đều quét toàn bộ collection rồi
// sort trong RAM.
translatorApplicationSchema.index({ status: 1, createdAt: -1 });
translatorApplicationSchema.index({ status: 1, updatedAt: -1 });

module.exports = mongoose.model(
  "TranslatorApplication",
  translatorApplicationSchema,
);

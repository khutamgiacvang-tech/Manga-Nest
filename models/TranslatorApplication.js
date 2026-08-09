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

module.exports = mongoose.model(
  "TranslatorApplication",
  translatorApplicationSchema,
);

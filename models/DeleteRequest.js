const mongoose = require("mongoose");

const deleteRequestSchema = new mongoose.Schema(
  {
    manga: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "Manga",

      required: true,
    },

    translator: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      required: true,
    },

    reason: {
      type: String,

      default: "",
    },

    status: {
      type: String,

      enum: ["pending", "approved", "rejected"],

      default: "pending",
    },

    reviewedBy: {
      type: mongoose.Schema.Types.ObjectId,

      ref: "User",

      default: null,
    },

    reviewedAt: {
      type: Date,

      default: null,
    },
  },
  {
    timestamps: true,
  },
);

module.exports = mongoose.model("DeleteRequest", deleteRequestSchema);

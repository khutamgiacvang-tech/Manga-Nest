const mongoose = require("mongoose");

const commentSchema = new mongoose.Schema(
  {
    manga: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Manga",
      required: true,
      index: true,
    },

    // Bình luận thuộc về 1 chương cụ thể (mỗi chương có bình luận riêng)
    chapter: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Chapter",
      required: true,
      index: true,
    },

    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
      index: true,
    },

    content: {
      type: String,
      required: true,
      trim: true,
      maxlength: 1000,
    },

    // Dùng nếu sau này muốn xóa mềm
    isDeleted: {
      type: Boolean,
      default: false,
    },

    // Đánh dấu bình luận đã được chỉnh sửa
    isEdited: {
      type: Boolean,
      default: false,
    },

    // Admin ẩn bình luận (vi phạm quy định) mà không xóa vĩnh viễn
    isHidden: {
      type: Boolean,
      default: false,
    },

    // Lý do bị ẩn (admin nhập khi ẩn)
    hiddenReason: {
      type: String,
      default: "",
    },
  },
  {
    timestamps: true,
  },
);

// Sắp xếp comment mới nhất trước
commentSchema.index({
  createdAt: -1,
});

// Lấy nhanh bình luận theo từng chương
commentSchema.index({
  chapter: 1,
  createdAt: -1,
});

module.exports = mongoose.model("Comment", commentSchema);

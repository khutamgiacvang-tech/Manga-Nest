const mongoose = require("mongoose");

const notificationSchema = new mongoose.Schema(
  {
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true,
    },

    title: {
      type: String,
      required: true,
    },

    message: {
      type: String,
      required: true,
    },

    link: {
      type: String,
      default: "#",
    },

    image: {
      type: String,
      default: "",
    },

    isRead: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// Query này chạy trên MỌI request của user đã đăng nhập (global middleware
// trong app.js) -> bắt buộc phải có index, nếu không sẽ full collection
// scan + sort trong RAM mỗi lần load bất kỳ trang nào.
notificationSchema.index({ user: 1, createdAt: -1 });

module.exports = mongoose.model("Notification", notificationSchema);

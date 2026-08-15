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

// TTL index: MongoDB tự động xoá thông báo sau 7 ngày kể từ createdAt.
// Lưu ý: TTL index phải là index đơn (single-field) trên field kiểu Date,
// không dùng chung được với index compound ở trên nên phải tạo riêng.
// MongoDB chạy 1 background job kiểm tra mỗi ~60s để xoá các doc hết hạn,
// nên việc xoá không diễn ra chính xác ngay giây thứ 7 ngày mà có độ trễ nhỏ.
notificationSchema.index(
  { createdAt: 1 },
  { expireAfterSeconds: 7 * 24 * 60 * 60 },
);

module.exports = mongoose.model("Notification", notificationSchema);

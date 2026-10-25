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

// =======================================================
// Mọi thông báo mới tạo (Notification.create) đều được đẩy luôn xuống điện
// thoại bằng Expo Push -> hiện thông báo NỔI trên app mobile.
// Trước đây chỉ thông báo "chương mới" có gửi Expo Push, còn duyệt truyện,
// duyệt translator, ẩn/xóa bình luận/chương... chỉ lưu vào chuông nên điện
// thoại không hiện thông báo nổi.
// Riêng "📚 Chương mới" đã được gửi push riêng (kèm data mangaSlug) trong
// mangaController/uploadApiController nên bỏ qua ở đây để không bị gửi 2 lần.
// =======================================================
const SKIP_EXPO_PUSH_TITLES = ["📚 Chương mới"];

notificationSchema.pre("save", function () {
  this.$locals.wasNew = this.isNew;
});

notificationSchema.post("save", function (doc) {
  if (!doc.$locals || !doc.$locals.wasNew) return;
  if (SKIP_EXPO_PUSH_TITLES.includes(doc.title)) return;

  // fire-and-forget: push lỗi không được làm hỏng việc tạo thông báo
  (async () => {
    try {
      // require trễ để tránh vòng lặp require giữa các model
      const User = mongoose.model("User");
      const sendExpoPushNotification = require("../utils/sendExpoPushNotification");
      const user = await User.findById(doc.user).select("expoPushTokens");
      if (!user || !user.expoPushTokens || !user.expoPushTokens.length) return;

      const slugMatch = /^\/manga\/([^/]+)/.exec(doc.link || "");
      await sendExpoPushNotification(user._id, user.expoPushTokens, {
        title: doc.title,
        body: doc.message,
        data: {
          type: "notification",
          notificationId: String(doc._id),
          link: doc.link || "#",
          ...(slugMatch ? { mangaSlug: slugMatch[1] } : {}),
        },
      });
    } catch (err) {
      console.error("[notification/expo-push]", err.message);
    }
  })();
});

module.exports = mongoose.model("Notification", notificationSchema);

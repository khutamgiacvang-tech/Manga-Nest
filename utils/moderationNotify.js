const Notification = require("../models/Notification");
const User = require("../models/User");
const sendPushNotification = require("./sendPushNotification");

// =======================================================
// Gửi thông báo kiểm duyệt (ẩn / xóa bình luận, chương...)
// tới 1 user cụ thể - vừa lưu chuông thông báo, vừa push
// =======================================================

async function notifyUser({ userId, title, message, link, image }) {
  try {
    const notification = await Notification.create({
      user: userId,
      title,
      message,
      link: link || "#",
      image: image || "",
    });

    const user = await User.findById(userId).select("pushSubscription");

    if (user && user.pushSubscription && user.pushSubscription.endpoint) {
      const payload = JSON.stringify({
        title,
        body: message,
      });

      sendPushNotification(userId, user.pushSubscription, payload);
    }

    return notification;
  } catch (err) {
    console.error("Lỗi tạo thông báo kiểm duyệt:", err);
    return null;
  }
}

module.exports = { notifyUser };

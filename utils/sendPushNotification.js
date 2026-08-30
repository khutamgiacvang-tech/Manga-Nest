const webpush = require("web-push");
const User = require("../models/User");

// =========================
// Gửi push notification AN TOÀN — dùng chung cho mọi nơi trong project
// (mangaController, moderationNotify, pushHelper, app.js...) thay vì gọi
// thẳng webpush.sendNotification() rồi chỉ console.error khi lỗi.
// =========================
// Lý do cần helper này: khi user gỡ web app / xóa cache trình duyệt / đổi
// thiết bị..., subscription cũ trong DB sẽ vĩnh viễn không dùng được nữa.
// Cloud Messaging (FCM/Mozilla...) trả về:
//   - 410 Gone      -> "push subscription has unsubscribed or expired"
//   - 404 Not Found -> subscription không còn tồn tại
// Nếu không dọn dẹp, mỗi lần có chương mới / thông báo mới, code sẽ CỨ
// GỌI LẠI subscription hỏng đó và log lỗi liên tục vô ích. Helper này bắt
// đúng 2 mã lỗi trên và tự xóa pushSubscription của user khỏi DB, các lỗi
// khác (mạng chập chờn, VAPID sai...) vẫn được log ra để dễ debug.

async function sendPushNotification(userId, subscription, payloadString) {
  if (!subscription || !subscription.endpoint) return;

  try {
    await webpush.sendNotification(subscription, payloadString);
  } catch (err) {
    const isExpired = err && (err.statusCode === 410 || err.statusCode === 404);

    if (isExpired) {
      console.log(
        `[push] Subscription của user ${userId} đã hết hạn/hủy đăng ký ` +
          `(status ${err.statusCode}) -> xóa khỏi DB.`,
      );

      // Best-effort: không throw nếu update DB lỗi, chỉ log.
      try {
        await User.findByIdAndUpdate(userId, {
          $set: { pushSubscription: null },
        });
      } catch (dbErr) {
        console.error(
          `[push] Không xóa được pushSubscription hỏng của user ${userId}:`,
          dbErr.message,
        );
      }

      return;
    }

    // Lỗi khác (không phải hết hạn) -> log để còn biết mà debug (VD sai
    // VAPID key, mất mạng, payload quá lớn...).
    console.error(`[push] Lỗi gửi push tới user ${userId}:`, err.message);
  }
}

module.exports = sendPushNotification;

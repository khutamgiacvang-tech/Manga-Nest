const webpush = require("web-push");
const Follow = require("../models/Follow"); 
const Notification = require("../models/Notification");

async function notifyNewChapter(mangaId, mangaTitle, chapterNumber) {
    try {
        const follows = await Follow.find({ manga: mangaId }).populate("user");

        const payload = JSON.stringify({
            title: "MangaNest - Chương mới!",
            body: `Bộ truyện "${mangaTitle}" vừa ra mắt chương ${chapterNumber}. Đọc ngay nào!`
        });

        for (const item of follows) {
            if (!item.user) continue;
            const user = item.user;

            // Tạo chuông thông báo trong database
            await Notification.create({
                user: user._id,
                message: `Bộ truyện "${mangaTitle}" vừa có chương ${chapterNumber}`,
                link: `/manga/${mangaId}`,
                isRead: false
            });

            // Gửi push notification nếu user đã đăng ký
            if (user.pushSubscription && user.pushSubscription.endpoint) {
                webpush.sendNotification(user.pushSubscription, payload).catch(err => {
                    console.error("Lỗi đẩy thông báo tới user:", user._id, err);
                });
            }
        }
    } catch (error) {
        console.error("Lỗi xử lý gửi thông báo chương mới:", error);
    }
}

module.exports = { notifyNewChapter };
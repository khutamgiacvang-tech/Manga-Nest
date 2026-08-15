const Notification = require("../models/Notification");

// Trang xem tất cả thông báo (giống trang /notifications của cuutruyen)
exports.list = async (req, res) => {
  try {
    if (!req.user) {
      req.flash("error", "Vui lòng đăng nhập.");

      return res.redirect("/login");
    }

    const notifications = await Notification.find({
      user: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const unread = notifications.filter((n) => !n.isRead);

    const read = notifications.filter((n) => n.isRead);

    res.render("notification/list", {
      title: "Thông báo",
      unread,
      read,
    });
  } catch (err) {
    console.log(err);

    req.flash("error", "Không thể tải thông báo.");

    res.redirect("/");
  }
};

// Đánh dấu 1 thông báo đã đọc
exports.readNotification = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, {
      isRead: true,
    });

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.json({
      success: false,
    });
  }
};

// Đánh dấu tất cả đã đọc
exports.readAll = async (req, res) => {
  try {
    await Notification.updateMany(
      {
        user: req.user._id,
        isRead: false,
      },

      {
        isRead: true,
      },
    );

    res.json({
      success: true,
    });
  } catch (err) {
    console.log(err);

    res.json({
      success: false,
    });
  }
};

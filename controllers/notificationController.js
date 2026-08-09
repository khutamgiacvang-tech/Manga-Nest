const Notification = require("../models/Notification");

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

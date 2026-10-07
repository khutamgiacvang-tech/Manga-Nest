const Notification = require("../../models/Notification");

// =========================
// GET /api/v1/notifications
// (bản JSON của notificationController.list)
// =========================
exports.list = async (req, res) => {
  try {
    const notifications = await Notification.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const unread = notifications.filter((n) => !n.isRead);
    const read = notifications.filter((n) => n.isRead);

    return res.json({ success: true, unread, read });
  } catch (err) {
    console.error("[api/notifications/list]", err);
    return res.status(500).json({ success: false, message: "Không thể tải thông báo." });
  }
};

// =========================
// POST /api/v1/notifications/:id/read
// =========================
exports.readNotification = async (req, res) => {
  try {
    await Notification.findByIdAndUpdate(req.params.id, { isRead: true });
    return res.json({ success: true });
  } catch (err) {
    console.error("[api/notifications/read]", err);
    return res.status(500).json({ success: false });
  }
};

// =========================
// POST /api/v1/notifications/read-all
// =========================
exports.readAll = async (req, res) => {
  try {
    await Notification.updateMany(
      { user: req.user._id, isRead: false },
      { isRead: true },
    );
    return res.json({ success: true });
  } catch (err) {
    console.error("[api/notifications/read-all]", err);
    return res.status(500).json({ success: false });
  }
};

// =========================
// POST /api/v1/notifications/expo-token
// Đăng ký thiết bị Mobile nhận push chapter mới.
// =========================
exports.saveExpoToken = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();

    if (!token || (!token.startsWith("ExponentPushToken[") && !token.startsWith("ExpoPushToken["))) {
      return res.status(400).json({
        success: false,
        message: "Expo Push Token không hợp lệ.",
      });
    }

    await req.user.updateOne({
      $addToSet: { expoPushTokens: token },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[api/notifications/save-expo-token]", err);
    return res.status(500).json({ success: false, message: "Không thể lưu Push Token." });
  }
};

// =========================
// POST /api/v1/notifications/expo-token/remove
// =========================
exports.removeExpoToken = async (req, res) => {
  try {
    const token = String(req.body?.token || "").trim();
    if (!token) return res.json({ success: true });

    await req.user.updateOne({
      $pull: { expoPushTokens: token },
    });

    return res.json({ success: true });
  } catch (err) {
    console.error("[api/notifications/remove-expo-token]", err);
    return res.status(500).json({ success: false });
  }
};

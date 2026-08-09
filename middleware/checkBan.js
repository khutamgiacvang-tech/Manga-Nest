const User = require("../models/User");

module.exports = async (req, res, next) => {
  try {
    // Chưa đăng nhập
    if (!req.user) {
      return next();
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return next();
    }

    console.log("CHECKBAN user.status:", user.status, "| path:", req.path);

    // Không bị ban
    if (user.status !== "banned") {
      return next();
    }

    console.log(
      "CHECKBAN user IS banned, isPermanentBan:",
      user.isPermanentBan,
      "banUntil:",
      user.banUntil,
    );

    // =========================
    // Ban còn hiệu lực
    // =========================

    const stillBanned =
      user.isPermanentBan || (user.banUntil && user.banUntil > new Date());

    if (stillBanned) {
      // Logout user trước
      return req.logout((err) => {
        if (err) {
          return next(err);
        }

        // Redirect sang trang banned kèm email
        return res.redirect(`/banned?email=${encodeURIComponent(user.email)}`);
      });
    }

    // =========================
    // Hết hạn ban -> tự mở khóa
    // =========================

    user.status = "active";
    user.isBanned = false;
    user.banReason = "";
    user.banUntil = null;
    user.isPermanentBan = false;

    await user.save();

    console.log("CHECKBAN: Auto unban", user.email);

    next();
  } catch (err) {
    console.error(err);
    next();
  }
};

module.exports = async (req, res, next) => {
  try {
    // Chưa đăng nhập
    if (!req.user) {
      return next();
    }

    // Passport (deserializeUser) đã load user đầy đủ từ DB cho request
    // này rồi -> KHÔNG query lại User.findById() ở đây nữa. Trước đây
    // mỗi request của user đã đăng nhập phải cõng thêm 1 round-trip DB
    // hoàn toàn thừa (mỗi lần click là thêm 1 lần gọi DB), đây là 1
    // trong những nguyên nhân chính khiến trang load chậm.
    const user = req.user;

    // Không bị ban
    if (user.status !== "banned") {
      return next();
    }

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

    next();
  } catch (err) {
    console.error(err);
    next();
  }
};

module.exports = (req, res, next) => {
  if (!req.isAuthenticated()) {
    req.flash(
      "error",

      "Vui lòng đăng nhập.",
    );

    return res.redirect("/");
  }

  if (req.user.role !== "translator" && req.user.role !== "admin") {
    req.flash(
      "error",

      "Bạn chưa có quyền đăng truyện.",
    );

    return res.redirect("/translator/apply");
  }

  next();
};

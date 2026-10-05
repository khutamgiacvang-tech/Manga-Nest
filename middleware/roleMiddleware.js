// Phân quyền theo vai trò.
// Admin là role cao nhất nên luôn được phép đi qua mọi guard role-level
// (ví dụ authorize("translator")), nhưng vẫn phải đăng nhập.
exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user) {
      req.flash("error", "Vui lòng đăng nhập.");
      return res.redirect("/");
    }

    if (req.user.role === "admin" || roles.includes(req.user.role)) {
      return next();
    }

    req.flash("error", "Bạn không có quyền truy cập.");
    return res.redirect("/");
  };
};

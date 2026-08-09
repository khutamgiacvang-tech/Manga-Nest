exports.authorize = (...roles) => {
  return (req, res, next) => {
    if (!req.user || !roles.includes(req.user.role)) {
      req.flash("error", "Bạn không có quyền truy cập.");
      return res.redirect("/");
    }
    next();
  };
};

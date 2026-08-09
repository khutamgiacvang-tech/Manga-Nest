exports.isAuthenticated = (req, res, next) => {
  if (req.isAuthenticated()) {
    return next();
  }

  req.flash("error", "Vui lòng đăng nhập.");

  return res.redirect("/login");
};

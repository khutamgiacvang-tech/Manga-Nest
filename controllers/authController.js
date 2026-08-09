const passport = require("passport");
const crypto = require("crypto");
const User = require("../models/User");
const { sendResetPasswordEmail } = require("../utils/mailer");

// =======================
// Đăng ký
// =======================
exports.register = async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      req.flash("error", "Vui lòng nhập đầy đủ thông tin.");

      return res.redirect("/");
    }

    if (password !== confirmPassword) {
      req.flash("error", "Mật khẩu xác nhận không khớp.");

      return res.redirect("/");
    }

    const existed = await User.findOne({ email });

    if (existed) {
      req.flash("error", "Email đã tồn tại.");

      return res.redirect("/");
    }

    const user = new User({
      username,
      email,
      password,
      provider: "local",
    });

    await user.save();

    req.flash("success", "Đăng ký thành công.");

    return res.redirect("/");
  } catch (err) {
    console.log(err);

    req.flash("error", "Có lỗi xảy ra.");

    return res.redirect("/");
  }
};

// =======================
// Đăng nhập
// =======================
exports.login = (req, res, next) => {
  passport.authenticate("local", (err, user, info) => {
    if (err) {
      console.log(err);
      return next(err);
    }

    if (!user) {
      console.log(info);
      req.flash("error", info.message);
      return res.redirect("/");
    }

    // =======================
    // Kiểm tra tài khoản bị ban
    // =======================
    if (user.status === "banned") {
      const stillBanned =
        user.isPermanentBan ||
        (user.banUntil && new Date(user.banUntil) > new Date());

      console.log("LOGIN SUCCESS:", user.email);
      console.log("DEBUG user.status:", user.status);
      console.log("DEBUG stillBanned:", stillBanned);

      if (stillBanned) {
        return res.redirect(`/banned?email=${encodeURIComponent(user.email)}`);
      }
    }

    req.logIn(user, (err) => {
      if (err) {
        return next(err);
      }

      console.log("LOGIN SUCCESS:", user.email);

      req.flash("success", "Đăng nhập thành công.");
      return res.redirect("/");
    });
  })(req, res, next);
};
// =======================
// Đăng xuất
// =======================

exports.logout = (req, res, next) => {
  req.logout(function (err) {
    if (err) return next(err);

    res.redirect("/");
  });
};

// =======================
// Quên mật khẩu - Hiển thị form nhập email
// =======================
exports.showForgotPassword = (req, res) => {
  res.render("forgotPassword", {
    title: "Quên mật khẩu",
  });
};

// =======================
// Quên mật khẩu - Gửi email chứa link reset
// =======================
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      req.flash("error", "Vui lòng nhập email.");
      return res.redirect("/forgot-password");
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    // Không tiết lộ email có tồn tại hay không (tránh dò email người dùng)
    // -> luôn báo thành công dù user có tồn tại hay không
    if (!user) {
      req.flash(
        "success",
        "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu.",
      );
      return res.redirect("/forgot-password");
    }

    // Tài khoản đăng nhập bằng Google/Discord thì không có mật khẩu local
    if (user.provider !== "local") {
      req.flash(
        "error",
        `Tài khoản này đăng nhập bằng ${
          user.provider === "google" ? "Google" : "Discord"
        }, không thể đặt lại mật khẩu.`,
      );
      return res.redirect("/forgot-password");
    }

    // Tạo token ngẫu nhiên, chỉ lưu bản hash vào DB (an toàn hơn lưu token thô)
    const rawToken = crypto.randomBytes(32).toString("hex");
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000; // 15 phút

    await user.save();

    const resetUrl = `${req.protocol}://${req.get(
      "host",
    )}/reset-password/${rawToken}`;

    try {
      await sendResetPasswordEmail({
        to: user.email,
        username: user.username,
        resetUrl,
      });
    } catch (mailErr) {
      console.log("SEND MAIL ERROR:", mailErr);

      // Gửi mail lỗi thì rollback token để user có thể thử lại ngay
      user.resetPasswordToken = null;
      user.resetPasswordExpires = null;
      await user.save();

      req.flash("error", "Không thể gửi email lúc này. Vui lòng thử lại sau.");
      return res.redirect("/forgot-password");
    }

    req.flash(
      "success",
      "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu.",
    );
    return res.redirect("/forgot-password");
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra, vui lòng thử lại.");
    return res.redirect("/forgot-password");
  }
};

// =======================
// Reset mật khẩu - Hiển thị form nhập mật khẩu mới
// =======================
exports.showResetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      req.flash("error", "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      return res.redirect("/forgot-password");
    }

    res.render("resetPassword", {
      title: "Đặt lại mật khẩu",
      token,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra, vui lòng thử lại.");
    return res.redirect("/forgot-password");
  }
};

// =======================
// Reset mật khẩu - Xử lý lưu mật khẩu mới
// =======================
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;
    const { password, confirmPassword } = req.body;

    if (!password || !confirmPassword) {
      req.flash("error", "Vui lòng nhập đầy đủ mật khẩu.");
      return res.redirect(`/reset-password/${token}`);
    }

    if (password.length < 6) {
      req.flash("error", "Mật khẩu phải có ít nhất 6 ký tự.");
      return res.redirect(`/reset-password/${token}`);
    }

    if (password !== confirmPassword) {
      req.flash("error", "Mật khẩu xác nhận không khớp.");
      return res.redirect(`/reset-password/${token}`);
    }

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: { $gt: Date.now() },
    });

    if (!user) {
      req.flash("error", "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");
      return res.redirect("/forgot-password");
    }

    user.password = password; // hook pre("save") trong User model sẽ tự hash
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    req.flash(
      "success",
      "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
    );
    return res.redirect("/");
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra, vui lòng thử lại.");
    return res.redirect("/forgot-password");
  }
};

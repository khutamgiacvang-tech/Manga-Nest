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

      req.flash("error", info?.message || "Đăng nhập thất bại.");

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
    if (err) {
      return next(err);
    }

    res.redirect("/");
  });
};

// =======================
// Quên mật khẩu
// Hiển thị form nhập email
// =======================
exports.showForgotPassword = (req, res) => {
  res.render("forgotPassword", {
    title: "Quên mật khẩu",
  });
};

// =======================
// Quên mật khẩu
// Gửi email chứa link reset
// =======================
exports.forgotPassword = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      req.flash("error", "Vui lòng nhập email.");

      return res.redirect("/forgot-password");
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({
      email: normalizedEmail,
    });

    // Không tiết lộ email có tồn tại hay không
    if (!user) {
      req.flash(
        "success",
        "Nếu email tồn tại trong hệ thống, chúng tôi đã gửi link đặt lại mật khẩu.",
      );

      return res.redirect("/forgot-password");
    }

    // =======================
    // Tài khoản Google / Discord
    // =======================
    if (user.provider !== "local") {
      req.flash(
        "error",
        `Tài khoản này đăng nhập bằng ${
          user.provider === "google" ? "Google" : "Discord"
        }, không thể đặt lại mật khẩu.`,
      );

      return res.redirect("/forgot-password");
    }

    // =======================
    // Tạo reset token
    // =======================

    // Token gốc gửi cho người dùng
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Chỉ lưu hash của token vào database
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;

    // Token hết hạn sau 15 phút
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;

    await user.save();

    // =======================
    // Tạo link reset
    // =======================
    //
    // Dùng domain riêng của MangaNest
    // thay vì req.get("host")
    //
    const baseUrl = process.env.APP_URL || "https://manganest.site";

    const resetUrl = `${baseUrl}/reset-password/${rawToken}`;

    console.log("RESET PASSWORD URL:", resetUrl);

    // =======================
    // Gửi email
    // =======================
    try {
      await sendResetPasswordEmail({
        to: user.email,
        username: user.username,
        resetUrl,
      });
    } catch (mailErr) {
      console.log("SEND MAIL ERROR:", mailErr);

      // Nếu gửi mail thất bại
      // thì xóa token để user thử lại
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
// Reset mật khẩu
// Hiển thị form nhập mật khẩu mới
// =======================
exports.showResetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    // Hash token nhận từ URL
    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // Tìm user có token hợp lệ
    // và token chưa hết hạn
    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: {
        $gt: Date.now(),
      },
    });

    if (!user) {
      req.flash("error", "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

      return res.redirect("/forgot-password");
    }

    return res.render("resetPassword", {
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
// Reset mật khẩu
// Xử lý lưu mật khẩu mới
// =======================
exports.resetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    const { password, confirmPassword } = req.body;

    // =======================
    // Kiểm tra dữ liệu
    // =======================

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

    // =======================
    // Hash token
    // =======================

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

    // =======================
    // Tìm user
    // =======================

    const user = await User.findOne({
      resetPasswordToken: hashedToken,
      resetPasswordExpires: {
        $gt: Date.now(),
      },
    });

    if (!user) {
      req.flash("error", "Link đặt lại mật khẩu không hợp lệ hoặc đã hết hạn.");

      return res.redirect("/forgot-password");
    }

    // =======================
    // Cập nhật mật khẩu
    // =======================
    //
    // Hook pre("save") trong User model
    // sẽ tự hash password
    //
    user.password = password;

    // Token chỉ được sử dụng một lần
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

const passport = require("passport");
const crypto = require("crypto");
const User = require("../models/User");
const { sendResetPasswordEmail, sendVerifyEmail } = require("../utils/mailer");

// =======================
// Kiểm tra định dạng Gmail thật
// (chỉ chấp nhận @gmail.com / @googlemail.com, theo đúng quy tắc đặt tên
// của Gmail: 6-30 ký tự, chỉ gồm chữ/số/dấu chấm, không bắt đầu/kết thúc
// bằng dấu chấm, không có 2 dấu chấm liền nhau). Việc này chặn ngay các
// email kiểu "abc@gmailz.com", "abc@gmail.con", "khong-phai-gmail@xyz.com"...
// Còn việc email đó có THẬT SỰ tồn tại hay không sẽ được xác nhận ở bước
// gửi mail kích hoạt bên dưới (chỉ ai đọc được hộp thư Gmail đó mới có
// thể bấm link để kích hoạt tài khoản).
// =======================
function isValidGmail(email) {
  if (!email) return false;

  const normalized = email.toLowerCase().trim();

  const match = normalized.match(
    /^([a-z0-9](?:[a-z0-9.]{4,28})[a-z0-9])@(gmail\.com|googlemail\.com)$/,
  );

  if (!match) return false;

  const localPart = match[1];

  // Không cho phép 2 dấu chấm liền nhau (Gmail cũng không cho phép)
  if (localPart.includes("..")) return false;

  return true;
}

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

    const normalizedEmail = email.toLowerCase().trim();

    if (!isValidGmail(normalizedEmail)) {
      req.flash(
        "error",
        "Vui lòng đăng ký bằng một địa chỉ Gmail hợp lệ (@gmail.com).",
      );
      return res.redirect("/");
    }

    const existed = await User.findOne({
      email: normalizedEmail,
    });

    if (existed) {
      req.flash("error", "Email đã tồn tại.");
      return res.redirect("/");
    }

    // =======================
    // Tạo token xác minh Gmail
    // =======================

    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    const user = new User({
      username,
      email: normalizedEmail,
      password,
      provider: "local",
      isVerified: false,
      emailVerifyToken: hashedToken,
      // Token hết hạn sau 24 giờ
      emailVerifyExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

    await user.save();

    // =======================
    // Gửi email xác minh - đây là bước chứng thực Gmail đó là thật
    // (nếu Gmail không tồn tại/không phải của người đăng ký thì họ sẽ
    // không bao giờ bấm được link kích hoạt, và tài khoản mãi mãi ở
    // trạng thái chưa xác minh -> không đăng nhập được)
    // =======================

    const baseUrl = (process.env.APP_URL || "https://manganest.site").replace(
      /\/$/,
      "",
    );

    const verifyUrl = `${baseUrl}/verify-email/${rawToken}`;

    console.log("VERIFY EMAIL URL:", verifyUrl);

    try {
      await sendVerifyEmail({
        to: user.email,
        username: user.username,
        verifyUrl,
      });

      console.log("VERIFY EMAIL SENT TO:", user.email);
    } catch (mailErr) {
      console.error("SEND VERIFY MAIL ERROR:", mailErr);

      // Gửi mail thất bại -> xoá tài khoản vừa tạo để user thử đăng ký lại
      await User.deleteOne({ _id: user._id });

      req.flash(
        "error",
        "Không thể gửi email xác minh lúc này. Vui lòng thử lại sau.",
      );

      return res.redirect("/");
    }

    req.flash(
      "success",
      "Đăng ký thành công! Vui lòng kiểm tra hộp thư Gmail (và mục Spam) để xác minh tài khoản trước khi đăng nhập.",
    );

    return res.redirect("/");
  } catch (err) {
    console.log("REGISTER ERROR:", err);

    req.flash("error", "Có lỗi xảy ra.");

    return res.redirect("/");
  }
};

// =======================
// Xác minh Gmail (bấm link trong email)
// =======================
exports.verifyEmail = async (req, res) => {
  try {
    const { token } = req.params;

    const hashedToken = crypto
      .createHash("sha256")
      .update(token)
      .digest("hex");

    const user = await User.findOne({
      emailVerifyToken: hashedToken,
      emailVerifyExpires: { $gt: Date.now() },
    });

    if (!user) {
      req.flash(
        "error",
        "Link xác minh không hợp lệ hoặc đã hết hạn. Vui lòng đăng ký lại hoặc yêu cầu gửi lại email xác minh.",
      );
      return res.redirect("/");
    }

    user.isVerified = true;
    user.emailVerifyToken = null;
    user.emailVerifyExpires = null;

    await user.save();

    req.flash(
      "success",
      "Xác minh Gmail thành công! Bây giờ bạn có thể đăng nhập.",
    );

    return res.redirect("/");
  } catch (err) {
    console.log("VERIFY EMAIL ERROR:", err);

    req.flash("error", "Có lỗi xảy ra khi xác minh email.");

    return res.redirect("/");
  }
};

// =======================
// Gửi lại email xác minh
// =======================
exports.resendVerifyEmail = async (req, res) => {
  try {
    const { email } = req.body;

    if (!email) {
      req.flash("error", "Vui lòng nhập email.");
      return res.redirect("/");
    }

    const normalizedEmail = email.toLowerCase().trim();

    const user = await User.findOne({ email: normalizedEmail });

    // Không tiết lộ email có tồn tại hay không
    if (!user || user.provider !== "local" || user.isVerified) {
      req.flash(
        "success",
        "Nếu email tồn tại và chưa xác minh, chúng tôi đã gửi lại link xác minh.",
      );
      return res.redirect("/");
    }

    const rawToken = crypto.randomBytes(32).toString("hex");

    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.emailVerifyToken = hashedToken;
    user.emailVerifyExpires = Date.now() + 24 * 60 * 60 * 1000;

    await user.save();

    const baseUrl = (process.env.APP_URL || "https://manganest.site").replace(
      /\/$/,
      "",
    );

    const verifyUrl = `${baseUrl}/verify-email/${rawToken}`;

    try {
      await sendVerifyEmail({
        to: user.email,
        username: user.username,
        verifyUrl,
      });
    } catch (mailErr) {
      console.error("RESEND VERIFY MAIL ERROR:", mailErr);

      req.flash("error", "Không thể gửi email lúc này. Vui lòng thử lại sau.");
      return res.redirect("/");
    }

    req.flash(
      "success",
      "Nếu email tồn tại và chưa xác minh, chúng tôi đã gửi lại link xác minh.",
    );

    return res.redirect("/");
  } catch (err) {
    console.log("RESEND VERIFY EMAIL ERROR:", err);

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
      console.log("LOGIN ERROR:", err);
      return next(err);
    }

    if (!user) {
      console.log("LOGIN FAILED:", info);

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
  req.logout((err) => {
    if (err) {
      return next(err);
    }

    res.redirect("/");
  });
};

// =======================
// Quên mật khẩu
// Hiển thị form
// =======================
exports.showForgotPassword = (req, res) => {
  res.render("forgotPassword", {
    title: "Quên mật khẩu",
  });
};

// =======================
// Quên mật khẩu
// Gửi email reset
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
    // Google / Discord
    // =======================
    if (user.provider !== "local") {
      const providerName = user.provider === "google" ? "Google" : "Discord";

      req.flash(
        "error",
        `Tài khoản này đăng nhập bằng ${providerName}, không thể đặt lại mật khẩu.`,
      );

      return res.redirect("/forgot-password");
    }

    // =======================
    // Tạo reset token
    // =======================

    // Token gửi cho email
    const rawToken = crypto.randomBytes(32).toString("hex");

    // Hash token để lưu DB
    const hashedToken = crypto
      .createHash("sha256")
      .update(rawToken)
      .digest("hex");

    user.resetPasswordToken = hashedToken;

    // Token hết hạn sau 15 phút
    user.resetPasswordExpires = Date.now() + 15 * 60 * 1000;

    await user.save();

    // =======================
    // Tạo URL reset
    // =======================

    const baseUrl = (process.env.APP_URL || "https://manganest.site").replace(
      /\/$/,
      "",
    );

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

      console.log("RESET PASSWORD EMAIL SENT TO:", user.email);
    } catch (mailErr) {
      console.error("SEND MAIL ERROR:", mailErr);

      // Xóa token nếu gửi mail thất bại
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
    console.error("FORGOT PASSWORD ERROR:", err);

    req.flash("error", "Có lỗi xảy ra, vui lòng thử lại.");

    return res.redirect("/forgot-password");
  }
};

// =======================
// Reset mật khẩu
// Hiển thị form
// =======================
exports.showResetPassword = async (req, res) => {
  try {
    const { token } = req.params;

    const hashedToken = crypto.createHash("sha256").update(token).digest("hex");

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
    console.error("SHOW RESET PASSWORD ERROR:", err);

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

    user.password = password;

    // Token chỉ dùng được 1 lần
    user.resetPasswordToken = null;
    user.resetPasswordExpires = null;

    await user.save();

    console.log("PASSWORD RESET SUCCESS:", user.email);

    req.flash(
      "success",
      "Đặt lại mật khẩu thành công. Vui lòng đăng nhập lại.",
    );

    return res.redirect("/");
  } catch (err) {
    console.error("RESET PASSWORD ERROR:", err);

    req.flash("error", "Có lỗi xảy ra, vui lòng thử lại.");

    return res.redirect("/forgot-password");
  }
};

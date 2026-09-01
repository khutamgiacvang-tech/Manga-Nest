const express = require("express");
const passport = require("passport");
const crypto = require("crypto");
const { signAccessToken, signRefreshToken } = require("../config/jwt");

const router = express.Router();

const authController = require("../controllers/authController");

// =====================
// Local
// =====================

router.post("/login", authController.login);

router.post("/register", authController.register);

router.get("/logout", authController.logout);

// =====================
// Xác minh Gmail
// =====================

router.get("/verify-email/:token", authController.verifyEmail);

router.post("/resend-verification", authController.resendVerifyEmail);

// =====================
// Quên mật khẩu / Reset mật khẩu
// =====================

router.get("/forgot-password", authController.showForgotPassword);

router.post("/forgot-password", authController.forgotPassword);

router.get("/reset-password/:token", authController.showResetPassword);

router.post("/reset-password/:token", authController.resetPassword);

// =====================
// OAuth cho Mobile / Expo Go
// =====================
// Mobile dùng WebBrowser/AuthSession để chạy OAuth an toàn (Google không
// cho phép đăng nhập trực tiếp trong WebView). Sau khi Passport xác thực
// xong, web cấp một mã dùng 1 lần rồi app đổi mã đó lấy JWT.
function isAllowedMobileRedirect(uri) {
  if (!uri || typeof uri !== "string") return false;
  return (
    uri.startsWith("exp://") ||
    uri.startsWith("manganest://") ||
    uri.startsWith("http://localhost")
  );
}

function issueMobileOAuthCode(req, user) {
  if (!req.app.locals.mobileOAuthCodes) {
    req.app.locals.mobileOAuthCodes = new Map();
  }

  const code = crypto.randomBytes(32).toString("hex");
  req.app.locals.mobileOAuthCodes.set(code, {
    userId: user._id.toString(),
    expiresAt: Date.now() + 2 * 60 * 1000,
  });

  return code;
}

function finishMobileOAuth(req, res, user, provider) {
  const mobile = req.session.mobileOAuth;
  if (!mobile?.redirectUri) return false;

  const redirectUri = mobile.redirectUri;
  delete req.session.mobileOAuth;

  if (!isAllowedMobileRedirect(redirectUri)) {
    return res.status(400).send("Mobile OAuth redirect URI không hợp lệ.");
  }

  if (
    user.status === "banned" &&
    (user.isPermanentBan || (user.banUntil && new Date(user.banUntil) > new Date()))
  ) {
    const url = `${redirectUri}${redirectUri.includes("?") ? "&" : "?"}error=${encodeURIComponent("Tài khoản đã bị khóa.")}`;
    return res.redirect(url);
  }

  const code = issueMobileOAuthCode(req, user);
  const separator = redirectUri.includes("?") ? "&" : "?";
  const target = `${redirectUri}${separator}code=${encodeURIComponent(code)}&provider=${encodeURIComponent(provider)}`;

  return res.redirect(target);
}

// =====================
// Google
// =====================

router.get("/auth/google", (req, res, next) => {
  if (req.query.mobile === "1") {
    const redirectUri = req.query.redirect_uri;
    if (!isAllowedMobileRedirect(redirectUri)) {
      return res.status(400).send("Mobile OAuth redirect URI không hợp lệ.");
    }
    req.session.mobileOAuth = { redirectUri };
  }

  return passport.authenticate("google", {
    scope: ["profile", "email"],
  })(req, res, next);
});

router.get("/auth/google/callback", (req, res, next) => {
  passport.authenticate("google", (err, user) => {
    if (err) {
      console.log("GOOGLE ERR:", err);
      return next(err);
    }

    if (!user) {
      console.log("GOOGLE: no user returned from strategy");
      req.flash("error", "Đăng nhập Google thất bại.");
      return res.redirect("/");
    }

    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }

      if (req.session.mobileOAuth?.redirectUri) {
        return finishMobileOAuth(req, res, user, "google");
      }

      console.log("GOOGLE LOGIN SUCCESS:", user.email);
      console.log("GOOGLE DEBUG user.status:", user.status);
      console.log(
        "GOOGLE DEBUG isPermanentBan:",
        user.isPermanentBan,
        "banUntil:",
        user.banUntil,
      );

      if (user.status === "banned") {
        const stillBanned =
          user.isPermanentBan ||
          (user.banUntil && new Date(user.banUntil) > new Date());

        console.log("GOOGLE DEBUG stillBanned:", stillBanned);

        if (stillBanned) {
          return res.redirect(
            `/banned?email=${encodeURIComponent(user.email)}`,
          );
        }
      }

      console.log("GOOGLE DEBUG falling through to redirect /");

      req.flash("success", "Đăng nhập Google thành công.");
      return res.redirect("/");
    });
  })(req, res, next);
});

// =====================
// Discord
// =====================

router.get("/auth/discord", (req, res, next) => {
  if (req.query.mobile === "1") {
    const redirectUri = req.query.redirect_uri;
    if (!isAllowedMobileRedirect(redirectUri)) {
      return res.status(400).send("Mobile OAuth redirect URI không hợp lệ.");
    }
    req.session.mobileOAuth = { redirectUri };
  }

  return passport.authenticate("discord")(req, res, next);
});

router.get("/auth/discord/callback", (req, res, next) => {
  passport.authenticate("discord", (err, user) => {
    if (err) {
      console.log("DISCORD ERR:", err);
      return next(err);
    }

    if (!user) {
      console.log("DISCORD: no user returned from strategy");
      req.flash("error", "Đăng nhập Discord thất bại.");
      return res.redirect("/");
    }

    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }

      if (req.session.mobileOAuth?.redirectUri) {
        return finishMobileOAuth(req, res, user, "discord");
      }

      console.log("DISCORD LOGIN SUCCESS:", user.email);
      console.log("DISCORD DEBUG user.status:", user.status);
      console.log(
        "DISCORD DEBUG isPermanentBan:",
        user.isPermanentBan,
        "banUntil:",
        user.banUntil,
      );

      if (user.status === "banned") {
        const stillBanned =
          user.isPermanentBan ||
          (user.banUntil && new Date(user.banUntil) > new Date());

        console.log("DISCORD DEBUG stillBanned:", stillBanned);

        if (stillBanned) {
          return res.redirect(
            `/banned?email=${encodeURIComponent(user.email)}`,
          );
        }
      }

      console.log("DISCORD DEBUG falling through to redirect /");

      req.flash("success", "Đăng nhập Discord thành công.");
      return res.redirect("/");
    });
  })(req, res, next);
});

// =====================
// Trang bị khóa (banned)
// =====================

const User = require("../models/User");

router.get("/banned", async (req, res) => {
  try {
    const { email } = req.query;

    if (!email) {
      return res.redirect("/");
    }

    const user = await User.findOne({ email });

    if (!user || user.status !== "banned") {
      return res.redirect("/");
    }

    const stillBanned =
      user.isPermanentBan ||
      (user.banUntil && new Date(user.banUntil) > new Date());

    if (!stillBanned) {
      return res.redirect("/");
    }

    res.render("banned", {
      title: "Tài khoản bị khóa",
      banInfo: {
        isPermanentBan: user.isPermanentBan,
        banUntil: user.banUntil,
        banReason: user.banReason,
      },
    });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
});

module.exports = router;

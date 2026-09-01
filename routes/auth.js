const express = require("express");
const passport = require("passport");
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
// OAuth cho Mobile App
// =====================
// App mở OAuth trong WebView. Các route này đánh dấu phiên hiện tại là
// mobile rồi dùng callback Google/Discord hiện có. Sau khi Passport xác thực,
// callback sẽ trả JWT về URL fragment để WebView của app đọc được.
// Fragment (#...) không được gửi lên server nên token không xuất hiện trong
// request URL/log server.
function getMobileRedirectUri(req) {
  const value = String(req.query.redirect_uri || "").trim();
  if (!value) return null;

  // Chỉ cho phép các redirect scheme dùng cho Expo/ứng dụng MangaNest.
  // Không chấp nhận URL tùy ý để tránh biến endpoint này thành open redirect.
  const allowed =
    value.startsWith("exp://") ||
    value.startsWith("manganest://") ||
    value.startsWith("http://localhost") ||
    value.startsWith("https://auth.expo.io/");

  return allowed ? value : null;
}

router.get("/auth/mobile/google", (req, res, next) => {
  const redirectUri = getMobileRedirectUri(req);
  if (!redirectUri) {
    return res.status(400).send("Redirect URI của ứng dụng không hợp lệ.");
  }

  req.session.mobileOAuth = { provider: "google", redirectUri };
  req.session.save((saveErr) => {
    if (saveErr) return next(saveErr);
    passport.authenticate("google", {
      scope: ["profile", "email"],
    })(req, res, next);
  });
});

router.get("/auth/mobile/discord", (req, res, next) => {
  const redirectUri = getMobileRedirectUri(req);
  if (!redirectUri) {
    return res.status(400).send("Redirect URI của ứng dụng không hợp lệ.");
  }

  req.session.mobileOAuth = { provider: "discord", redirectUri };
  req.session.save((saveErr) => {
    if (saveErr) return next(saveErr);
    passport.authenticate("discord")(req, res, next);
  });
});

router.get("/mobile-app-auth", (req, res) => {
  res.status(200).send(`<!doctype html>
<html lang="vi">
<head>
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>MangaNest - Đăng nhập</title>
<style>
body{font-family:Arial,sans-serif;background:#111;color:#fff;display:flex;min-height:100vh;align-items:center;justify-content:center;text-align:center}
.box{padding:28px}.ok{font-size:42px}.text{opacity:.8}
</style>
</head>
<body><div class="box"><div class="ok">✓</div><h2>Đăng nhập thành công</h2><div class="text">Bạn có thể quay lại MangaNest.</div></div></body>
</html>`);
});

// =====================
// Google
// =====================

router.get(
  "/auth/google",
  passport.authenticate("google", {
    scope: ["profile", "email"],
  }),
);

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

      console.log("GOOGLE LOGIN SUCCESS:", user.email);

      if (req.session.mobileOAuth?.provider === "google") {
        const mobileRedirectUri = req.session.mobileOAuth.redirectUri;
        delete req.session.mobileOAuth;

        const stillBanned =
          user.status === "banned" &&
          (user.isPermanentBan ||
            (user.banUntil && new Date(user.banUntil) > new Date()));

        if (stillBanned) {
          return req.session.save(() => {
            return res.redirect(
              `${mobileRedirectUri}#error=${encodeURIComponent("Tài khoản đã bị khóa.")}`
            );
          });
        }

        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);
        return req.session.save(() => {
          return res.redirect(
            `${mobileRedirectUri}#accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`
          );
        });
      }

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

router.get("/auth/discord", passport.authenticate("discord"));

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

      console.log("DISCORD LOGIN SUCCESS:", user.email);

      if (req.session.mobileOAuth?.provider === "discord") {
        const mobileRedirectUri = req.session.mobileOAuth.redirectUri;
        delete req.session.mobileOAuth;

        const stillBanned =
          user.status === "banned" &&
          (user.isPermanentBan ||
            (user.banUntil && new Date(user.banUntil) > new Date()));

        if (stillBanned) {
          return req.session.save(() => {
            return res.redirect(
              `${mobileRedirectUri}#error=${encodeURIComponent("Tài khoản đã bị khóa.")}`
            );
          });
        }

        const accessToken = signAccessToken(user);
        const refreshToken = signRefreshToken(user);
        return req.session.save(() => {
          return res.redirect(
            `${mobileRedirectUri}#accessToken=${encodeURIComponent(accessToken)}&refreshToken=${encodeURIComponent(refreshToken)}`
          );
        });
      }

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

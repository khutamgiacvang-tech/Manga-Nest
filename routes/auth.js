const express = require("express");
const passport = require("passport");
const { createCode } = require("../utils/mobileOAuthCodes");

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
// Google
// =====================

router.get(
  "/auth/google",
  (req, res, next) => {
    // App mobile gửi kèm ?mobile=1&redirect_uri=... -> lưu vào session để
    // callback biết cần redirect code về app thay vì trang web.
    if (req.query.mobile === "1" && req.query.redirect_uri) {
      req.session.mobileOAuthRedirect = req.query.redirect_uri;
    } else {
      delete req.session.mobileOAuthRedirect;
    }
    next();
  },
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
      if (req.session.mobileOAuthRedirect) {
        const redirectUri = req.session.mobileOAuthRedirect;
        delete req.session.mobileOAuthRedirect;
        return res.redirect(`${redirectUri}?error=${encodeURIComponent("Đăng nhập Google thất bại.")}`);
      }
      req.flash("error", "Đăng nhập Google thất bại.");
      return res.redirect("/");
    }

    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }

      console.log("GOOGLE LOGIN SUCCESS:", user.email);
      console.log("GOOGLE DEBUG user.status:", user.status);
      console.log(
        "GOOGLE DEBUG isPermanentBan:",
        user.isPermanentBan,
        "banUntil:",
        user.banUntil,
      );

      const mobileRedirectUri = req.session.mobileOAuthRedirect;
      delete req.session.mobileOAuthRedirect;

      if (user.status === "banned") {
        const stillBanned =
          user.isPermanentBan ||
          (user.banUntil && new Date(user.banUntil) > new Date());

        console.log("GOOGLE DEBUG stillBanned:", stillBanned);

        if (stillBanned) {
          if (mobileRedirectUri) {
            return res.redirect(
              `${mobileRedirectUri}?error=${encodeURIComponent("Tài khoản đã bị khóa.")}`,
            );
          }
          return res.redirect(
            `/banned?email=${encodeURIComponent(user.email)}`,
          );
        }
      }

      if (mobileRedirectUri) {
        // Đăng nhập từ app mobile: đổi session lấy 1 code ngắn hạn,
        // đưa app đi đổi code này lấy JWT ở POST /api/v1/auth/oauth/exchange.
        const code = createCode(user._id);
        return res.redirect(`${mobileRedirectUri}?code=${code}`);
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

router.get(
  "/auth/discord",
  (req, res, next) => {
    console.log("[DISCORD OAUTH] start", {
      mobile: req.query.mobile,
      redirect_uri: req.query.redirect_uri,
      clientIdConfigured: !!process.env.DISCORD_CLIENT_ID,
      callbackUrl: process.env.DISCORD_CALLBACK_URL,
    });
    if (!process.env.DISCORD_CLIENT_ID || !process.env.DISCORD_CLIENT_SECRET || !process.env.DISCORD_CALLBACK_URL) {
      return res.status(500).send("Discord OAuth chưa được cấu hình đầy đủ trên Render.");
    }
    if (req.query.mobile === "1" && req.query.redirect_uri) {
      req.session.mobileOAuthRedirect = req.query.redirect_uri;
    } else {
      delete req.session.mobileOAuthRedirect;
    }
    next();
  },
  passport.authenticate("discord"),
);

router.get("/auth/discord/callback", (req, res, next) => {
  passport.authenticate("discord", (err, user) => {
    if (err) {
      console.log("DISCORD ERR:", err);
      return next(err);
    }

    if (!user) {
      console.log("DISCORD: no user returned from strategy");
      if (req.session.mobileOAuthRedirect) {
        const redirectUri = req.session.mobileOAuthRedirect;
        delete req.session.mobileOAuthRedirect;
        return res.redirect(`${redirectUri}?error=${encodeURIComponent("Đăng nhập Discord thất bại.")}`);
      }
      req.flash("error", "Đăng nhập Discord thất bại.");
      return res.redirect("/");
    }

    req.logIn(user, function (err) {
      if (err) {
        return next(err);
      }

      console.log("DISCORD LOGIN SUCCESS:", user.email);
      console.log("DISCORD DEBUG user.status:", user.status);
      console.log(
        "DISCORD DEBUG isPermanentBan:",
        user.isPermanentBan,
        "banUntil:",
        user.banUntil,
      );

      const mobileRedirectUri = req.session.mobileOAuthRedirect;
      delete req.session.mobileOAuthRedirect;

      if (user.status === "banned") {
        const stillBanned =
          user.isPermanentBan ||
          (user.banUntil && new Date(user.banUntil) > new Date());

        console.log("DISCORD DEBUG stillBanned:", stillBanned);

        if (stillBanned) {
          if (mobileRedirectUri) {
            return res.redirect(
              `${mobileRedirectUri}?error=${encodeURIComponent("Tài khoản đã bị khóa.")}`,
            );
          }
          return res.redirect(
            `/banned?email=${encodeURIComponent(user.email)}`,
          );
        }
      }

      if (mobileRedirectUri) {
        const code = createCode(user._id);
        return res.redirect(`${mobileRedirectUri}?code=${code}`);
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

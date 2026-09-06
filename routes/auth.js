const express = require("express");
const crypto = require("crypto");
const passport = require("passport");
const { createCode } = require("../utils/mobileOAuthCodes");

const router = express.Router();

// Ghép query vào deep-link mobile an toàn, tránh tạo URL kiểu
// manganest://oauth?code=... sai khi redirect URI đã có query.
function mobileRedirect(redirectUri, params = {}) {
  const url = new URL(redirectUri);
  Object.entries(params).forEach(([key, value]) => url.searchParams.set(key, value));
  return url.toString();
}

// Discord có thể mở callback ở một trình duyệt khác với trình duyệt đã
// bắt đầu OAuth, vì vậy không nên chỉ dựa vào req.session để nhớ deep-link
// của app. Ta mang redirect URI theo OAuth state có chữ ký.
const MOBILE_OAUTH_STATE_TTL_MS = 10 * 60 * 1000;

function getMobileStateSecret() {
  return process.env.SESSION_SECRET || "manganest-secret";
}

function isAllowedMobileRedirect(uri) {
  try {
    const url = new URL(uri);
    return url.protocol === "manganest:" && (!url.hostname || url.hostname === "oauth");
  } catch (_) {
    return false;
  }
}

function createMobileOAuthState(redirectUri) {
  if (!isAllowedMobileRedirect(redirectUri)) return null;
  const payload = Buffer.from(
    JSON.stringify({ r: redirectUri, t: Date.now() }),
    "utf8",
  ).toString("base64url");
  const sig = crypto
    .createHmac("sha256", getMobileStateSecret())
    .update(payload)
    .digest("base64url");
  return `${payload}.${sig}`;
}

function readMobileOAuthState(state) {
  try {
    if (!state || typeof state !== "string") return null;
    const [payload, sig] = state.split(".");
    if (!payload || !sig) return null;
    const expected = crypto
      .createHmac("sha256", getMobileStateSecret())
      .update(payload)
      .digest("base64url");
    if (sig.length !== expected.length || !crypto.timingSafeEqual(Buffer.from(sig), Buffer.from(expected))) {
      return null;
    }
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8"));
    if (!data?.r || !data?.t || Date.now() - Number(data.t) > MOBILE_OAUTH_STATE_TTL_MS) return null;
    return isAllowedMobileRedirect(data.r) ? data.r : null;
  } catch (_) {
    return null;
  }
}

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
        return res.redirect(mobileRedirect(redirectUri, { error: "Đăng nhập Google thất bại." }));
      }
      req.flash("error", "Đăng nhập Google thất bại.");
      return res.redirect("/");
    }

    req.logIn(user, function (err) {
      if (err) {
        const redirectUri = readMobileOAuthState(req.query.state) || req.session.mobileOAuthRedirect;
        if (redirectUri) {
          delete req.session.mobileOAuthRedirect;
          return res.redirect(mobileRedirect(redirectUri, { error: "Không tạo được phiên đăng nhập Discord." }));
        }
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
              mobileRedirect(mobileRedirectUri, { error: "Tài khoản đã bị khóa." }),
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
        return res.redirect(mobileRedirect(mobileRedirectUri, { code }));
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
    if (req.query.mobile === "1" && req.query.redirect_uri) {
      const redirectUri = String(req.query.redirect_uri);
      const state = createMobileOAuthState(redirectUri);

      if (!state) {
        return res.status(400).send("Redirect URI mobile không hợp lệ.");
      }

      // Giữ lại session như fallback, nhưng state có chữ ký mới là nguồn
      // chính để callback tìm lại deep-link của APK.
      req.session.mobileOAuthRedirect = redirectUri;
      return passport.authenticate("discord", { state })(req, res, next);
    }

    delete req.session.mobileOAuthRedirect;
    return passport.authenticate("discord")(req, res, next);
  },
);

router.get("/auth/discord/callback", (req, res, next) => {
  passport.authenticate("discord", (err, user) => {
    const stateRedirectUri = readMobileOAuthState(req.query.state);

    if (err) {
      console.log("DISCORD ERR:", err);
      const redirectUri = stateRedirectUri || req.session.mobileOAuthRedirect;
      if (redirectUri) {
        delete req.session.mobileOAuthRedirect;
        return res.redirect(mobileRedirect(redirectUri, { error: "Đăng nhập Discord thất bại." }));
      }
      return next(err);
    }

    if (!user) {
      console.log("DISCORD: no user returned from strategy");
      const redirectUri = stateRedirectUri || req.session.mobileOAuthRedirect;
      if (redirectUri) {
        delete req.session.mobileOAuthRedirect;
        return res.redirect(mobileRedirect(redirectUri, { error: "Đăng nhập Discord thất bại." }));
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

      // Ưu tiên redirect URI được ký trong OAuth state. Điều này tránh lỗi
      // browser/Chrome/Oppo Browser làm mất session cookie sau khi Discord
      // redirect về callback. Session vẫn được dùng làm fallback.
      const mobileRedirectUri =
        readMobileOAuthState(req.query.state) || req.session.mobileOAuthRedirect;
      delete req.session.mobileOAuthRedirect;

      if (user.status === "banned") {
        const stillBanned =
          user.isPermanentBan ||
          (user.banUntil && new Date(user.banUntil) > new Date());

        console.log("DISCORD DEBUG stillBanned:", stillBanned);

        if (stillBanned) {
          if (mobileRedirectUri) {
            return res.redirect(
              mobileRedirect(mobileRedirectUri, { error: "Tài khoản đã bị khóa." }),
            );
          }
          return res.redirect(
            `/banned?email=${encodeURIComponent(user.email)}`,
          );
        }
      }

      if (mobileRedirectUri) {
        const code = createCode(user._id);
        const target = mobileRedirect(mobileRedirectUri, { code });
        console.log("DISCORD MOBILE REDIRECT:", target);
        return res.redirect(target);
      }

      console.log("DISCORD DEBUG: no mobile redirect found; falling through to /");

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

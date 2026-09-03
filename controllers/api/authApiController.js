const crypto = require("crypto");
const fs = require("fs");
const User = require("../../models/User");
const { sendVerifyEmail } = require("../../utils/mailer");
const uploadImage = require("../../utils/storageManager");
const cloudinary = require("../../config/cloudinary");
const storageManager = require("../../utils/storageManager");
const {
  signAccessToken,
  signRefreshToken,
  verifyToken,
} = require("../../config/jwt");

// =======================
// Kiểm tra định dạng Gmail thật (giống hệt logic web ở authController.js
// -> giữ đồng bộ 2 nơi, sau này có thể tách ra utils/ chung nếu cần)
// =======================
function isValidGmail(email) {
  if (!email) return false;

  const normalized = email.toLowerCase().trim();

  const match = normalized.match(
    /^([a-z0-9](?:[a-z0-9.]{4,28})[a-z0-9])@(gmail\.com|googlemail\.com)$/,
  );

  if (!match) return false;

  const localPart = match[1];

  if (localPart.includes("..")) return false;

  return true;
}

function publicUser(user) {
  return {
    id: user._id,
    username: user.username,
    email: user.email,
    avatar: user.avatar,
    bio: user.bio,
    displayName: user.displayName,
    facebook: user.facebook,
    description: user.description,
    role: user.role,
    provider: user.provider,
    isVerified: user.isVerified,
  };
}

// =======================
// Đăng ký (chỉ local - Google/Discord app dùng luồng OAuth riêng, xem README)
// =======================
exports.register = async (req, res) => {
  try {
    const { username, email, password, confirmPassword } = req.body;

    if (!username || !email || !password || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng nhập đầy đủ thông tin." });
    }

    if (password !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Mật khẩu xác nhận không khớp." });
    }

    const normalizedEmail = email.toLowerCase().trim();

    if (!isValidGmail(normalizedEmail)) {
      return res.status(400).json({
        success: false,
        message: "Vui lòng đăng ký bằng một địa chỉ Gmail hợp lệ (@gmail.com).",
      });
    }

    const existed = await User.findOne({ email: normalizedEmail });

    if (existed) {
      return res
        .status(409)
        .json({ success: false, message: "Email đã tồn tại." });
    }

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
      emailVerifyExpires: Date.now() + 24 * 60 * 60 * 1000,
    });

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
      console.error("[api/register] SEND VERIFY MAIL ERROR:", mailErr);

      await User.deleteOne({ _id: user._id });

      return res.status(500).json({
        success: false,
        message: "Không thể gửi email xác minh lúc này. Vui lòng thử lại sau.",
      });
    }

    return res.status(201).json({
      success: true,
      message: "Đăng ký thành công. Vui lòng kiểm tra Gmail để xác minh tài khoản.",
    });
  } catch (err) {
    console.error("[api/register]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =======================
// Đăng nhập -> trả về access token + refresh token
// =======================
exports.login = async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng nhập email và mật khẩu." });
    }

    const user = await User.findOne({ email: email.toLowerCase().trim() });

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Email không tồn tại." });
    }

    const match = await user.comparePassword(password);

    if (!match) {
      return res
        .status(401)
        .json({ success: false, message: "Sai mật khẩu." });
    }

    if (user.provider === "local" && !user.isVerified) {
      return res.status(403).json({
        success: false,
        message:
          "Tài khoản chưa xác minh Gmail. Vui lòng kiểm tra hộp thư để kích hoạt.",
      });
    }

    if (
      user.status === "banned" &&
      (user.isPermanentBan || (user.banUntil && user.banUntil > new Date()))
    ) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa.",
        banReason: user.banReason,
        banUntil: user.banUntil,
      });
    }

    return res.json({
      success: true,
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    console.error("[api/login]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =======================
// Đổi code (từ luồng Google/Discord OAuth, xem routes/auth.js) lấy JWT
// =======================
exports.oauthExchange = async (req, res) => {
  try {
    const { code } = req.body;
    if (!code) {
      return res.status(400).json({ success: false, message: "Thiếu mã đăng nhập." });
    }

    const { consumeCode } = require("../../utils/mobileOAuthCodes");
    const userId = consumeCode(code);
    if (!userId) {
      return res.status(400).json({
        success: false,
        message: "Mã đăng nhập không hợp lệ hoặc đã hết hạn.",
      });
    }

    const user = await User.findById(userId);
    if (!user) {
      return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản." });
    }

    if (
      user.status === "banned" &&
      (user.isPermanentBan || (user.banUntil && user.banUntil > new Date()))
    ) {
      return res.status(403).json({
        success: false,
        message: "Tài khoản đã bị khóa.",
        banReason: user.banReason,
        banUntil: user.banUntil,
      });
    }

    return res.json({
      success: true,
      accessToken: signAccessToken(user),
      refreshToken: signRefreshToken(user),
      user: publicUser(user),
    });
  } catch (err) {
    console.error("[api/oauthExchange]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =======================
// Cấp lại access token mới từ refresh token
// (app di động lưu refreshToken trong SecureStore, gọi endpoint này khi
// accessToken hết hạn thay vì bắt user đăng nhập lại mỗi 15 phút)
// =======================
exports.refresh = async (req, res) => {
  try {
    const { refreshToken } = req.body;

    if (!refreshToken) {
      return res
        .status(400)
        .json({ success: false, message: "Thiếu refreshToken." });
    }

    let payload;

    try {
      payload = verifyToken(refreshToken);
    } catch (err) {
      return res.status(401).json({
        success: false,
        message: "refreshToken không hợp lệ hoặc đã hết hạn.",
      });
    }

    if (payload.type !== "refresh") {
      return res
        .status(401)
        .json({ success: false, message: "Token không hợp lệ." });
    }

    const user = await User.findById(payload.sub);

    if (!user) {
      return res
        .status(401)
        .json({ success: false, message: "Tài khoản không tồn tại." });
    }

    return res.json({
      success: true,
      accessToken: signAccessToken(user),
    });
  } catch (err) {
    console.error("[api/refresh]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =======================
// Thông tin user hiện tại (yêu cầu requireAuth)
// =======================
exports.me = async (req, res) => {
  return res.json({ success: true, user: publicUser(req.user) });
};

// =======================
// Cập nhật hồ sơ (bản JSON của controllers/profileController.js -> updateProfile)
// multipart/form-data: avatar (file, optional), username, bio,
// displayName, facebook, description (2 field cuối chỉ có ý nghĩa với
// translator/admin nhưng cứ lưu nếu app gửi lên, giống hệt web)
// =======================
exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy tài khoản." });
    }

    const { username, bio, facebook, displayName, description } = req.body;

    if (username !== undefined) user.username = username;
    if (bio !== undefined) user.bio = bio;
    if (facebook !== undefined) user.facebook = facebook.trim();
    if (displayName !== undefined) user.displayName = displayName.trim();
    if (description !== undefined) user.description = description.trim();

    if (req.file) {
      if (user.avatar) {
        if (user.avatar.includes("cloudinary.com")) {
          try {
            const publicId = user.avatar
              .split("/upload/")[1]
              .replace(/^v\d+\//, "")
              .replace(/\.[^/.]+$/, "");
            await cloudinary.uploader.destroy(publicId);
          } catch (err) {
            console.log("Không xóa được avatar cũ:", err.message);
          }
        } else {
          try {
            await storageManager.deleteByUrl(user.avatar);
          } catch (err) {
            console.log("Không xóa được avatar cũ:", err.message);
          }
        }
      }

      const uploaded = await uploadImage(req.file.path, "manganest/avatar", {
        provider: "supabase",
      });

      user.avatar = uploaded.url;

      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

    await user.save();

    return res.json({
      success: true,
      message: "Cập nhật hồ sơ thành công.",
      user: publicUser(user),
    });
  } catch (err) {
    console.error("[api/updateProfile]", err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    return res
      .status(500)
      .json({ success: false, message: "Có lỗi xảy ra." });
  }
};

// =======================
// Đổi mật khẩu (bản JSON của controllers/profileController.js -> changePassword)
// =======================
exports.changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng nhập đầy đủ thông tin." });
    }

    if (newPassword.length < 6) {
      return res.status(400).json({
        success: false,
        message: "Mật khẩu mới phải có ít nhất 6 ký tự.",
      });
    }

    if (newPassword !== confirmPassword) {
      return res
        .status(400)
        .json({ success: false, message: "Mật khẩu xác nhận mới không khớp." });
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy tài khoản." });
    }

    if (user.provider !== "local" || !user.password) {
      return res.status(400).json({
        success: false,
        message: `Tài khoản này đăng nhập bằng ${
          user.provider === "google" ? "Google" : "Discord"
        }, không thể đổi mật khẩu ở đây.`,
      });
    }

    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      return res
        .status(401)
        .json({ success: false, message: "Mật khẩu hiện tại không đúng." });
    }

    user.password = newPassword; // hook pre("save") trong User model sẽ tự hash
    await user.save();

    return res.json({ success: true, message: "Đổi mật khẩu thành công." });
  } catch (err) {
    console.error("[api/changePassword]", err);
    return res
      .status(500)
      .json({ success: false, message: "Có lỗi xảy ra." });
  }
};

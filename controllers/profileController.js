const User = require("../models/User");
const fs = require("fs");
const path = require("path");
const uploadImage = require("../utils/cloudinaryUpload");
const cloudinary = require("../config/cloudinary");

// Hiển thị hồ sơ
exports.showProfile = (req, res) => {
  if (!req.isAuthenticated()) {
    return res.redirect("/");
  }

  res.render("profile", {
    title: "Hồ sơ",
  });
};

// =========================
// Cập nhật hồ sơ
// =========================

exports.updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);

    if (!user) {
      req.flash("error", "Không tìm thấy tài khoản.");
      return res.redirect("/profile");
    }

    const { username, bio, facebook, displayName, description } = req.body;

    user.username = username;
    user.bio = bio;

    // Các field này chỉ hiển thị form nhập cho translator/admin (xem profile.ejs),
    // nhưng cứ lưu nếu có gửi lên cho gọn, user thường sẽ không có field này trong form.
    if (facebook !== undefined) {
      user.facebook = facebook.trim();
    }

    if (displayName !== undefined) {
      user.displayName = displayName.trim();
    }

    if (description !== undefined) {
      user.description = description.trim();
    }

    // =========================
    // Upload Avatar Cloudinary
    // =========================

    if (req.file) {
      // Xóa avatar cũ trên Cloudinary
      if (user.avatar && user.avatar.includes("cloudinary.com")) {
        try {
          const publicId = user.avatar
            .split("/upload/")[1]
            .replace(/^v\d+\//, "")
            .replace(/\.[^/.]+$/, "");

          await cloudinary.uploader.destroy(publicId);
        } catch (err) {
          console.log("Không xóa được avatar cũ:", err.message);
        }
      }

      // Upload avatar mới
      const uploaded = await uploadImage(req.file.path, "manganest/avatar");

      user.avatar = uploaded.url;

      // Xóa file tạm
      if (fs.existsSync(req.file.path)) {
        fs.unlinkSync(req.file.path);
      }
    }

    await user.save();

    req.flash("success", "Cập nhật hồ sơ thành công.");
    res.redirect("/profile#account");
  } catch (err) {
    console.log(err);

    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/profile#account");
  }
};

// =========================
// Đổi mật khẩu
// =========================

exports.changePassword = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      req.flash("error", "Vui lòng đăng nhập.");
      return res.redirect("/");
    }

    const { currentPassword, newPassword, confirmPassword } = req.body;

    if (!currentPassword || !newPassword || !confirmPassword) {
      req.flash("error", "Vui lòng nhập đầy đủ thông tin.");
      return res.redirect("/profile#password");
    }

    if (newPassword.length < 6) {
      req.flash("error", "Mật khẩu mới phải có ít nhất 6 ký tự.");
      return res.redirect("/profile#password");
    }

    if (newPassword !== confirmPassword) {
      req.flash("error", "Mật khẩu xác nhận mới không khớp.");
      return res.redirect("/profile#password");
    }

    const user = await User.findById(req.user._id);

    if (!user) {
      req.flash("error", "Không tìm thấy tài khoản.");
      return res.redirect("/profile#password");
    }

    // Tài khoản Google/Discord không có mật khẩu local để đổi
    if (user.provider !== "local" || !user.password) {
      req.flash(
        "error",
        `Tài khoản này đăng nhập bằng ${
          user.provider === "google" ? "Google" : "Discord"
        }, không thể đổi mật khẩu ở đây.`,
      );
      return res.redirect("/profile#password");
    }

    const isMatch = await user.comparePassword(currentPassword);

    if (!isMatch) {
      req.flash("error", "Mật khẩu hiện tại không đúng.");
      return res.redirect("/profile#password");
    }

    user.password = newPassword; // hook pre("save") trong User model sẽ tự hash

    await user.save();

    req.flash("success", "Đổi mật khẩu thành công.");
    return res.redirect("/profile#password");
  } catch (err) {
    console.log(err);

    req.flash("error", "Có lỗi xảy ra.");
    return res.redirect("/profile#password");
  }
};

const Manga = require("../models/Manga");

exports.followLibrary = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      req.flash("error", "Vui lòng đăng nhập.");

      return res.redirect("/");
    }

    const followedIds = req.user.followedManga || [];

    const limit = 25;

    let page = parseInt(req.query.page) || 1;

    const totalItems = await Manga.countDocuments({
      _id: { $in: followedIds },
    });

    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

    // tránh page vượt quá số trang
    if (page > totalPages) page = totalPages;

    const mangas = await Manga.find({
      _id: { $in: followedIds },
    })
      .populate("translator", "username displayName avatar")
      .sort({ lastUpdated: -1 })
      .skip((page - 1) * limit)
      .limit(limit);

    res.render("profile/library", {
      title: "Danh sách theo dõi",
      mangas,
      currentPage: page,
      totalPages,
      totalItems,
    });
  } catch (err) {
    console.log(err);

    res.redirect("/");
  }
};

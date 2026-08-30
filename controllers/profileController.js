const User = require("../models/User");
const fs = require("fs");
const path = require("path");
const uploadImage = require("../utils/storageManager");
const cloudinary = require("../config/cloudinary");
const storageManager = require("../utils/storageManager");

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
    // Upload Avatar (Supabase Storage)
    // =========================

    if (req.file) {
      // Xóa avatar cũ — hỗ trợ cả avatar cũ còn trên Cloudinary lẫn avatar
      // mới trên storage hiện tại (Supabase Storage).
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

      // Upload avatar mới — luôn lưu ở Supabase Storage (tách riêng khỏi
      // Cloudinary, nơi chỉ dành cho ảnh trang chapter).
      const uploaded = await uploadImage(req.file.path, "manganest/avatar", {
        provider: "supabase",
      });

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
const Chapter = require("../models/Chapter");

exports.followLibrary = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      req.flash("error", "Vui lòng đăng nhập.");

      return res.redirect("/");
    }

    const followedIds = req.user.followedManga || [];

    // 24 truyện/trang: Desktop 4 cột x 6 hàng, Mobile/Tablet 3 cột x 8 hàng.
    const limit = 24;

    let page = parseInt(req.query.page) || 1;

    // totalItems và trang dữ liệu hiện tại không phụ thuộc nhau -> chạy
    // song song thay vì 2 round-trip DB nối tiếp (trước đây phải đợi có
    // totalItems xong mới bắt đầu query mangas). .lean() vì trang này chỉ
    // hiển thị, không gọi method của Mongoose document -> đỡ thời gian
    // dựng document.
    const [totalItems, mangas] = await Promise.all([
      Manga.countDocuments({ _id: { $in: followedIds } }),

      Manga.find({ _id: { $in: followedIds } })
        .populate("translator", "username displayName avatar")
        .sort({ lastUpdated: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(Math.ceil(totalItems / limit), 1);

    // Trường hợp hiếm (page trên URL vượt quá tổng số trang, ví dụ user
    // bỏ theo dõi bớt truyện rồi bấm Back): trang vừa lấy ở trên rỗng/lệch,
    // truy vấn lại đúng trang cuối. Chỉ tốn thêm 1 query trong trường hợp
    // hiếm này thay vì luôn phải đợi totalItems trước khi query như cũ.
    let finalMangas = mangas;

    if (page > totalPages) {
      page = totalPages;

      finalMangas = await Manga.find({ _id: { $in: followedIds } })
        .populate("translator", "username displayName avatar")
        .sort({ lastUpdated: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean();
    }

    // Lấy chapter mới nhất của cả trang bằng 1 aggregate query, giống hệt
    // cách trang "Danh sách truyện" (/manga) đang làm, để 2 giao diện
    // hiển thị cùng 1 kiểu thông tin (C. X - x phút trước).
    if (finalMangas.length > 0) {
      const latestChapters = await Chapter.aggregate([
        { $match: { manga: { $in: finalMangas.map((manga) => manga._id) } } },
        { $sort: { manga: 1, chapterOrder: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$manga",
            chapterNumber: { $first: "$chapterNumber" },
            createdAt: { $first: "$createdAt" },
          },
        },
      ]);

      const latestMap = new Map(
        latestChapters.map((chapter) => [String(chapter._id), chapter]),
      );

      for (const manga of finalMangas) {
        const latest = latestMap.get(String(manga._id));
        manga.lastChapter = latest?.chapterNumber || manga.lastChapter || 0;
        manga.lastChapterDate = latest?.createdAt || manga.createdAt;
      }
    }

    res.render("profile/library", {
      title: "Danh sách theo dõi",
      mangas: finalMangas,
      currentPage: page,
      totalPages,
      totalItems,
    });
  } catch (err) {
    console.log(err);

    res.redirect("/");
  }
};

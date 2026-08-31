const Category = require("../models/Category");
const Manga = require("../models/Manga");

function checkAdmin(req) {
  return req.isAuthenticated() && req.user.role === "admin";
}

// Nhận biết request gọi bằng fetch() (AJAX) từ admin-dashboard.js hay
// submit form truyền thống (không có JS / JS lỗi) -> quyết định trả về
// JSON (không reload trang) hay redirect + flash (cách cũ, để dự phòng).
function wantsJson(req) {
  return (req.headers.accept || "").includes("application/json");
}

// =============================
// Thêm thể loại mới
// =============================
exports.createCategory = async (req, res) => {
  try {
    if (!checkAdmin(req)) {
      if (wantsJson(req)) {
        return res.status(403).json({ success: false, message: "Bạn không có quyền." });
      }

      req.flash("error", "Bạn không có quyền.");
      return res.redirect("/");
    }

    const name = (req.body.name || "").trim();

    if (!name) {
      if (wantsJson(req)) {
        return res
          .status(400)
          .json({ success: false, message: "Vui lòng nhập tên thể loại." });
      }

      req.flash("error", "Vui lòng nhập tên thể loại.");
      return res.redirect("/admin#category-section");
    }

    const existed = await Category.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });

    if (existed) {
      const message = `Thể loại "${name}" đã tồn tại.`;

      if (wantsJson(req)) {
        return res.status(409).json({ success: false, message });
      }

      req.flash("error", message);
      return res.redirect("/admin#category-section");
    }

    const category = await Category.create({ name });

    const message = `Đã thêm thể loại "${name}".`;

    if (wantsJson(req)) {
      const totalCount = await Category.countDocuments();

      return res.json({
        success: true,
        message,
        category: { _id: category._id, name: category.name },
        totalCount,
      });
    }

    req.flash("success", message);
    res.redirect("/admin#category-section");
  } catch (err) {
    console.log(err);

    if (wantsJson(req)) {
      return res.status(500).json({ success: false, message: "Có lỗi xảy ra." });
    }

    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/admin#category-section");
  }
};

// =============================
// Xóa thể loại
// =============================
exports.deleteCategory = async (req, res) => {
  try {
    if (!checkAdmin(req)) {
      if (wantsJson(req)) {
        return res.status(403).json({ success: false, message: "Bạn không có quyền." });
      }

      req.flash("error", "Bạn không có quyền.");
      return res.redirect("/");
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      if (wantsJson(req)) {
        return res
          .status(404)
          .json({ success: false, message: "Không tìm thấy thể loại." });
      }

      req.flash("error", "Không tìm thấy thể loại.");
      return res.redirect("/admin#category-section");
    }

    // Không cho xóa nếu vẫn còn truyện đang gắn thể loại này.
    // (genres của Manga lưu bằng string trùng với tên Category, không
    // phải reference, nên phải so theo tên.)
    const mangaCount = await Manga.countDocuments({ genres: category.name });

    if (mangaCount > 0) {
      const message = `Không thể xóa thể loại "${category.name}" vì đang có ${mangaCount} truyện sử dụng.`;

      if (wantsJson(req)) {
        return res.status(409).json({ success: false, message });
      }

      req.flash("error", message);
      return res.redirect("/admin#category-section");
    }

    await Category.findByIdAndDelete(req.params.id);

    const message = `Đã xóa thể loại "${category.name}".`;

    if (wantsJson(req)) {
      const totalCount = await Category.countDocuments();

      return res.json({ success: true, message, totalCount });
    }

    req.flash("success", message);
    res.redirect("/admin#category-section");
  } catch (err) {
    console.log(err);

    if (wantsJson(req)) {
      return res.status(500).json({ success: false, message: "Có lỗi xảy ra." });
    }

    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/admin#category-section");
  }
};

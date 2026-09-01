const Category = require("../models/Category");
const Manga = require("../models/Manga");

function checkAdmin(req) {
  return req.isAuthenticated() && req.user.role === "admin";
}

// =============================
// Thêm thể loại mới
// =============================
exports.createCategory = async (req, res) => {
  try {
    if (!checkAdmin(req)) {
      req.flash("error", "Bạn không có quyền.");
      return res.redirect("/");
    }

    const name = (req.body.name || "").trim();

    if (!name) {
      req.flash("error", "Vui lòng nhập tên thể loại.");
      return res.redirect("/admin#category-section");
    }

    const existed = await Category.findOne({
      name: { $regex: `^${name}$`, $options: "i" },
    });

    if (existed) {
      req.flash("error", `Thể loại "${name}" đã tồn tại.`);
      return res.redirect("/admin#category-section");
    }

    await Category.create({ name });

    req.flash("success", `Đã thêm thể loại "${name}".`);
    res.redirect("/admin#category-section");
  } catch (err) {
    console.log(err);
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
      req.flash("error", "Bạn không có quyền.");
      return res.redirect("/");
    }

    const category = await Category.findById(req.params.id);

    if (!category) {
      req.flash("error", "Không tìm thấy thể loại.");
      return res.redirect("/admin#category-section");
    }

    // Không cho xóa nếu vẫn còn truyện đang gắn thể loại này.
    // (genres của Manga lưu bằng string trùng với tên Category, không
    // phải reference, nên phải so theo tên.)
    const mangaCount = await Manga.countDocuments({ genres: category.name });

    if (mangaCount > 0) {
      req.flash(
        "error",
        `Không thể xóa thể loại "${category.name}" vì đang có ${mangaCount} truyện sử dụng.`,
      );
      return res.redirect("/admin#category-section");
    }

    await Category.findByIdAndDelete(req.params.id);

    req.flash("success", `Đã xóa thể loại "${category.name}".`);
    res.redirect("/admin#category-section");
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/admin#category-section");
  }
};

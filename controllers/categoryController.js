const Category = require("../models/Category");

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

    await Category.findByIdAndDelete(req.params.id);

    // LƯU Ý: chỉ xóa khỏi danh sách để chọn khi đăng/sửa truyện mới.
    // Các truyện đã gắn thể loại này trước đó vẫn giữ nguyên tag cũ
    // (genres của Manga lưu bằng string, không phải reference tới Category).
    req.flash("success", `Đã xóa thể loại "${category.name}".`);
    res.redirect("/admin#category-section");
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/admin#category-section");
  }
};

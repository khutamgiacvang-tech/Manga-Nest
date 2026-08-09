const Category = require("../models/Category");

// Danh sách thể loại đang hard code trong views/manga/create.ejs và edit.ejs trước đây.
// Giữ nguyên y hệt để không làm thay đổi thể loại của các truyện đã có sẵn.
const DEFAULT_CATEGORIES = [
  "Action", "Adventure", "Comedy", "Drama", "Fantasy", "Harem",
  "Horror", "Mystery", "Psychological", "Romance", "Sci-Fi", "Tragedy",
  "Slice of Life", "Sports", "Supernatural", "Historical", "Adaptation",
  "Martial Arts", "School Life", "Seinen", "Shounen", "Monster", "Oneshot", "Zombie",
  "Shoujo", "Josei",
];

// Chỉ seed nếu collection Category đang trống (lần chạy đầu tiên sau khi
// nâng cấp từ hard code sang quản lý bằng DB). Nếu admin đã tự thêm/xóa
// thể loại thì sẽ không đụng vào nữa.
const seedDefaultCategories = async () => {
  try {
    const count = await Category.countDocuments();

    if (count > 0) return;

    await Category.insertMany(
      DEFAULT_CATEGORIES.map((name) => ({ name })),
      { ordered: false },
    );

    console.log(`✅ Đã seed ${DEFAULT_CATEGORIES.length} thể loại mặc định.`);
  } catch (err) {
    console.log("❌ Lỗi seed thể loại mặc định:", err.message);
  }
};

module.exports = seedDefaultCategories;

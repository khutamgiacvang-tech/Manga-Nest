const mongoose = require("mongoose");

const readingHistorySchema = new mongoose.Schema({
  user: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "User",
    required: true,
  },

  manga: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Manga",
  },

  mangaTitle: String,

  mangaSlug: String,

  cover: String,

  chapterNumber: Number,

  // Cache sẵn tên chương lúc lưu lịch sử, để trang "Lịch sử đọc" không
  // phải query lại Chapter cho từng dòng khi hiển thị (xem history()
  // trong mangaController.js). Field này trước đây bị thiếu trong schema
  // nên dù saveHistory() có gửi chapterTitle lên, Mongoose vẫn âm thầm
  // loại bỏ field lạ (strict mode) -> mọi bản ghi cũ đều rỗng, khiến
  // trang lịch sử luôn phải query bù cho từng chương.
  chapterTitle: {
    type: String,
    default: "",
  },

  progress: {
    type: Number,
    default: 0,
  },

  scrollPosition: {
    type: Number,
    default: 0,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

// Truy vấn khi vào trang chi tiết truyện / đọc chapter (findOne theo
// user+manga+chapterNumber) và trang "Lịch sử đọc" (find theo user,
// sort updatedAt) -> không có index thì mỗi lần đọc chapter đều quét
// toàn bộ collection.
readingHistorySchema.index({ user: 1, manga: 1, chapterNumber: 1 });
readingHistorySchema.index({ user: 1, updatedAt: -1 });

module.exports = mongoose.model("ReadingHistory", readingHistorySchema);

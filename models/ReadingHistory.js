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

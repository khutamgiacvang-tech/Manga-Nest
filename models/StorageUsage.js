const mongoose = require("mongoose");

// Theo dõi dung lượng đã dùng của từng storage provider (CloudStorage.io,
// Cloudinary) để tự động chuyển sang provider còn lại khi 1 bên
// gần đầy (>= STORAGE_LIMIT_BYTES). Chỉ track ảnh cover/banner/avatar/
// sample-images của đơn ứng tuyển dịch giả — ảnh trang chapter vẫn nằm
// bên Cloudinary, không tính vào đây.
const storageUsageSchema = new mongoose.Schema({
  provider: {
    type: String,
    required: true,
    unique: true,
  },

  bytesUsed: {
    type: Number,
    default: 0,
  },

  updatedAt: {
    type: Date,
    default: Date.now,
  },
});

module.exports = mongoose.model("StorageUsage", storageUsageSchema);

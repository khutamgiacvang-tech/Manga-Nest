const cloudinary = require("./cloudinary");

// =========================
// Cloudinary (dùng làm provider thứ 2 trong storageManager, thay cho iDrive e2)
// =========================
// Đây chỉ là 1 "adapter" mỏng bọc lại config/cloudinary.js sẵn có, để
// storageManager.js có thể coi Cloudinary như 1 provider trong danh sách
// PROVIDERS (song song với CloudStorage.io) cho ảnh cover/banner/avatar.
//
// ENV cần có (đã dùng chung với phần upload ảnh chapter cũ):
//   CLOUDINARY_CLOUD_NAME
//   CLOUDINARY_API_KEY
//   CLOUDINARY_API_SECRET

module.exports = {
  key: "cloudinary",
  label: "Cloudinary",
  type: "cloudinary",
  client: cloudinary,
  configured: Boolean(
    process.env.CLOUDINARY_CLOUD_NAME &&
      process.env.CLOUDINARY_API_KEY &&
      process.env.CLOUDINARY_API_SECRET,
  ),
};

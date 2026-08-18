const cloudinary = require("../config/cloudinary");
const storageManager = require("./storageManager");

// Xóa 1 ảnh cover/banner/avatar dựa vào publicId đã lưu trong DB.
// - publicId dạng "cloudstorage_io:..." hoặc "cloudinary:..." -> ảnh được
//   quản lý qua storageManager (tự biết provider nào để xóa đúng chỗ).
// - publicId khác (kiểu cũ, không có dấu ":", ví dụ "manganest/covers/abc123")
//   -> ảnh cũ upload trực tiếp qua Cloudinary trước đây, xóa qua
//   cloudinary.uploader.destroy như cũ.
// Không throw lỗi ra ngoài — chỉ log, vì xóa ảnh cũ thất bại không nên
// chặn luồng chính (đổi cover/banner/avatar mới vẫn phải chạy tiếp).
async function deleteUploadedImage(publicId) {
  if (!publicId) return;

  try {
    if (storageManager.isManagedPublicId(publicId)) {
      await storageManager.deleteByPublicId(publicId);
    } else {
      await cloudinary.uploader.destroy(publicId);
    }
  } catch (err) {
    console.log("Không xóa được ảnh cũ:", err.message);
  }
}

module.exports = deleteUploadedImage;

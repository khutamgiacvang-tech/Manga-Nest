const cloudinary = require("../config/cloudinary");
const storageManager = require("./storageManager");

// Xóa 1 ảnh cover/banner/avatar dựa vào publicId đã lưu trong DB.
// - publicId dạng "idrive_e2:..." hoặc "cloudstorage_io:..." -> ảnh mới,
//   xóa qua storageManager.
// - publicId khác (kiểu cũ, không có dấu ":", ví dụ "manganest/covers/abc123")
//   -> ảnh cũ trên Cloudinary, xóa qua cloudinary.uploader.destroy.
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

const cloudinary = require("../config/cloudinary");
const storageManager = require("./storageManager");

// Xóa 1 ảnh cover/banner/avatar dựa vào publicId đã lưu trong DB.
// - publicId dạng "supabase:..." -> ảnh mới (Supabase Storage), xóa qua
//   storageManager.
// - publicId khác (kiểu cũ, không có dấu ":", ví dụ "manganest/covers/abc123",
//   hoặc "idrive_e2:...", "cloudstorage_io:..." của các đợt ảnh trước đó)
//   -> ảnh cũ trên Cloudinary (hoặc iDrive e2 / CloudStorage.io đã ngưng
//   dùng), xóa qua cloudinary.uploader.destroy. Nếu publicId là
//   "idrive_e2:..."/"cloudstorage_io:..." mà provider đó đã bị gỡ khỏi
//   storageManager thì lệnh destroy của Cloudinary sẽ không xóa được gì —
//   không sao, ảnh cũ trên iDrive/CloudStorage vẫn còn nhưng không ảnh
//   hưởng ứng dụng.
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

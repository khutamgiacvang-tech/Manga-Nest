// =========================
// Bỏ dấu tiếng Việt + chuẩn hoá chữ thường
// Dùng để tạo field tìm kiếm không dấu (vd: "Làm Bảo Mẫu" -> "lam bao mau")
// =========================

function removeVietnameseTones(str) {
  if (!str) return "";

  str = str.toString().toLowerCase();

  str = str.normalize("NFD").replace(/[\u0300-\u036f]/g, "");

  str = str.replace(/đ/g, "d");

  // Loại bỏ ký tự đặc biệt còn sót lại, chỉ giữ chữ/số/khoảng trắng
  str = str.replace(/[^a-z0-9\s]/g, " ");

  // Gộp nhiều khoảng trắng thành 1
  str = str.replace(/\s+/g, " ").trim();

  return str;
}

module.exports = removeVietnameseTones;

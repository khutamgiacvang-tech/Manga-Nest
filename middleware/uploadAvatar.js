const multer = require("multer");
const path = require("path");
const fs = require("fs");

const uploadPath = path.join(__dirname, "../public/uploads/avatar");

// Cấu hình nơi lưu file
const storage = multer.diskStorage({
  destination: function (req, file, cb) {
    // Chỉ tạo thư mục khi thực sự có file được upload
    if (!fs.existsSync(uploadPath)) {
      fs.mkdirSync(uploadPath, { recursive: true });
    }
    cb(null, uploadPath);
  },

  filename: function (req, file, cb) {
    const ext = path.extname(file.originalname);

    const filename =
      "avatar-" + Date.now() + "-" + Math.round(Math.random() * 1e9) + ext;

    cb(null, filename);
  },
});

// Chỉ cho upload ảnh
const fileFilter = (req, file, cb) => {
  // Khi form được submit mà người dùng KHÔNG chọn ảnh mới (input file để trống),
  // trình duyệt vẫn gửi kèm field "avatar" nhưng với filename rỗng ("").
  // Nếu không chặn ở đây, Multer sẽ vẫn tạo thư mục uploads/avatar và lưu
  // một file rác mỗi lần user chỉ cập nhật username/bio mà không đổi avatar.
  // -> Bỏ qua âm thầm (không lỗi, không lưu file) trong trường hợp này.
  if (!file.originalname || file.originalname.trim() === "") {
    return cb(null, false);
  }

  const allow = /jpg|jpeg|png|webp|gif|jfif/;

  const ext = allow.test(path.extname(file.originalname).toLowerCase());

  const mime = allow.test(file.mimetype);

  if (ext && mime) {
    return cb(null, true);
  }

  cb(new Error("Chỉ được upload file ảnh."));
};

const upload = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 5 * 1024 * 1024,
  },
});

module.exports = upload;

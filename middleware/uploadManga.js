const multer = require("multer");
const path = require("path");
const fs = require("fs-extra");
const os = require("os");

// =========================
// Thư mục temporary
// =========================
// Dùng thư mục temp của hệ điều hành.
// Render có filesystem tạm thời nên không nên phụ thuộc vào
// thư mục temp tương đối trong project.
const uploadPath = path.join(os.tmpdir(), "manganest");

fs.ensureDirSync(uploadPath);

// =========================
// Multer storage
// =========================

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    fs.ensureDir(uploadPath)
      .then(() => {
        cb(null, uploadPath);
      })
      .catch((err) => {
        cb(err);
      });
  },

  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(null, unique + path.extname(file.originalname).toLowerCase());
  },
});

// =========================
// Kiểm tra loại file
// =========================

const fileFilter = (req, file, cb) => {
  // Cover / Banner / ảnh
  if (file.mimetype.startsWith("image/")) {
    return cb(null, true);
  }

  // ZIP chapter
  if (
    file.mimetype === "application/zip" ||
    file.mimetype === "application/x-zip-compressed" ||
    path.extname(file.originalname).toLowerCase() === ".zip"
  ) {
    return cb(null, true);
  }

  return cb(new Error("Chỉ được upload ảnh hoặc file ZIP."), false);
};

// =========================
// Multer
// =========================

module.exports = multer({
  storage,
  fileFilter,

  limits: {
    fileSize: 50 * 1024 * 1024,
  },
});

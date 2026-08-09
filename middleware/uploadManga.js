const multer = require("multer");
const path = require("path");
const fs = require("fs");

const coverPath = "public/uploads/covers";
const chapterPath = "public/uploads/chapters";

const ensureDir = (dir) => {
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
};

const storage = multer.diskStorage({
  destination: (req, file, cb) => {
    // Chỉ tạo thư mục khi thực sự có file được upload
    if (file.fieldname === "cover") {
      ensureDir(coverPath);
      cb(null, coverPath);
    } else {
      ensureDir(chapterPath);
      cb(null, chapterPath);
    }
  },

  filename: (req, file, cb) => {
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);

    cb(
      null,

      unique + path.extname(file.originalname),
    );
  },
});

const fileFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(
      new Error("Chỉ được upload ảnh."),

      false,
    );
  }
};

module.exports = multer({
  storage,

  fileFilter,

  limits: {
    fileSize: 10 * 1024 * 1024,
  },
});

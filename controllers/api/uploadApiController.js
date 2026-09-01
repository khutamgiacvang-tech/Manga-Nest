const Manga = require("../../models/Manga");
const Chapter = require("../../models/Chapter");
const Category = require("../../models/Category");
const User = require("../../models/User");
const Notification = require("../../models/Notification");
const slugify = require("slugify");
const fs = require("fs-extra");
const path = require("path");
const os = require("os");
const AdmZip = require("adm-zip");
const sharp = require("sharp");
const cloudinary = require("../../config/cloudinary");
const uploadImage = require("../../utils/storageManager");
const uploadChapterPageImage = require("../../utils/storageManager");
const deleteUploadedImage = require("../../utils/deleteUploadedImage");
const sendPushNotification = require("../../utils/sendPushNotification");

// =========================
// Bản JSON của controllers/mangaController.js — dùng riêng cho mobile
// app (React Native), xác thực bằng JWT (middleware/apiAuth.js) thay vì
// session. Toàn bộ logic nghiệp vụ (giới hạn dung lượng ảnh, nén ảnh,
// upload song song, cập nhật thống kê Manga, gửi thông báo...) giữ
// NGUYÊN như bản web để 2 luồng luôn nhất quán.
// =========================

const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB
const UPLOAD_CONCURRENCY = 5;

async function runWithConcurrency(items, limit, worker) {
  const results = new Array(items.length);
  let cursor = 0;

  async function runner() {
    while (cursor < items.length) {
      const i = cursor++;
      results[i] = await worker(items[i], i);
    }
  }

  const workerCount = Math.min(limit, items.length) || 1;
  await Promise.all(Array.from({ length: workerCount }, runner));
  return results;
}

async function ensureUnderSizeLimit(imagePath, index, entryName) {
  let stats = fs.statSync(imagePath);
  if (stats.size <= MAX_IMAGE_SIZE) return imagePath;

  const compressedPath = imagePath + "_compressed.jpg";
  let quality = 80;

  await sharp(imagePath).jpeg({ quality }).toFile(compressedPath);
  stats = fs.statSync(compressedPath);

  while (stats.size > MAX_IMAGE_SIZE && quality > 30) {
    quality -= 15;
    await sharp(imagePath).jpeg({ quality }).toFile(compressedPath);
    stats = fs.statSync(compressedPath);
  }

  fs.unlinkSync(imagePath);

  if (stats.size > MAX_IMAGE_SIZE) {
    fs.unlinkSync(compressedPath);
    throw new Error(
      `Trang ${index} (${entryName}) vẫn vượt quá 10MB sau khi nén (quality ${quality}%).`,
    );
  }

  return compressedPath;
}

// Xoá an toàn 1 file tạm multer (không throw nếu đã bị xoá / không tồn tại)
function safeUnlink(filePath) {
  if (filePath && fs.existsSync(filePath)) {
    try {
      fs.unlinkSync(filePath);
    } catch (err) {
      console.error("Không thể xóa file tạm:", err.message);
    }
  }
}

// =========================
// Quyền: chỉ translator/admin mới được đăng truyện. Kiểm tra ở đây
// (không dùng middleware/translatorMiddleware.js vì middleware đó
// redirect web, không phù hợp API JSON).
// =========================
function isTranslatorOrAdmin(user) {
  return user && (user.role === "translator" || user.role === "admin");
}

// =========================
// GET /api/v1/upload/genres
// (dùng chung được với /api/v1/manga/genres, giữ thêm route riêng cho
// rõ ngữ cảnh phía app)
// =========================
exports.genres = async (req, res) => {
  try {
    const allGenres = await Category.find().sort({ name: 1 }).lean();
    return res.json({ success: true, genres: allGenres.map((g) => g.name) });
  } catch (err) {
    console.error("[api/upload/genres]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =========================
// POST /api/v1/upload/manga  (tạo truyện mới)
// multipart/form-data: cover, banner (file, optional), title, author,
// description, alternativeTitles (chuỗi, cách nhau bởi dấu phẩy),
// status (ongoing|completed|hiatus), genres (mảng hoặc chuỗi)
// =========================
exports.createManga = async (req, res) => {
  try {
    if (!isTranslatorOrAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Bạn cần là dịch giả để đăng truyện.",
      });
    }

    const { title, alternativeTitles, author, description, status } = req.body;

    if (!title || !title.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng nhập tên truyện." });
    }

    if (!author || !author.trim()) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng nhập tác giả." });
    }

    let slug = slugify(title, { lower: true, strict: true, locale: "vi" });
    let count = 1;
    while (await Manga.findOne({ slug })) {
      slug =
        slugify(title, { lower: true, strict: true, locale: "vi" }) +
        "-" +
        count;
      count++;
    }

    let cover = "";
    let coverPublicId = "";
    let banner = "";
    let bannerPublicId = "";

    try {
      if (req.files?.cover) {
        const uploadedCover = await uploadImage(
          req.files.cover[0].path,
          "manganest/covers",
          { provider: "supabase" },
        );
        cover = uploadedCover.url;
        coverPublicId = uploadedCover.public_id;
      }

      if (req.files?.banner) {
        const uploadedBanner = await uploadImage(
          req.files.banner[0].path,
          "manganest/banners",
          { provider: "supabase" },
        );
        banner = uploadedBanner.url;
        bannerPublicId = uploadedBanner.public_id;
      }
    } finally {
      safeUnlink(req.files?.cover?.[0]?.path);
      safeUnlink(req.files?.banner?.[0]?.path);
    }

    const genres = req.body.genres
      ? Array.isArray(req.body.genres)
        ? req.body.genres
        : [req.body.genres]
      : [];

    const manga = new Manga({
      title: title.trim(),
      alternativeTitles: alternativeTitles
        ? alternativeTitles
            .split(",")
            .map((i) => i.trim())
            .filter((i) => i !== "")
        : [],
      slug,
      cover,
      coverPublicId,
      banner,
      bannerPublicId,
      author: author.trim(),
      description: description ? description.trim() : "",
      genres,
      publishStatus: status || "ongoing",
      status: "pending",
      translator: req.user._id,
    });

    await manga.save();

    const admins = await User.find({ role: "admin" });
    for (const admin of admins) {
      await Notification.create({
        user: admin._id,
        title: "📖 Truyện mới chờ duyệt",
        message: `${req.user.username} vừa upload truyện "${manga.title}".`,
        link: "/admin",
        image: manga.cover,
      });
    }

    return res.json({
      success: true,
      message: "Đăng truyện thành công. Vui lòng chờ Admin duyệt.",
      manga: { slug: manga.slug, title: manga.title, status: manga.status },
    });
  } catch (err) {
    console.error("[api/upload/createManga]", err);
    return res
      .status(500)
      .json({ success: false, message: err.message || "Có lỗi xảy ra." });
  }
};

// =========================
// POST /api/v1/upload/manga/:slug/chapter  (upload 1 chapter, file ZIP)
// multipart/form-data: zip (file), chapterNumber, title
// =========================
exports.uploadChapter = async (req, res) => {
  try {
    if (!isTranslatorOrAdmin(req.user)) {
      return res.status(403).json({
        success: false,
        message: "Bạn cần là dịch giả để đăng chương.",
      });
    }

    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      safeUnlink(req.file?.path);
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy truyện." });
    }

    const rawChapterInput = req.body.chapterNumber?.trim();
    const title = req.body.title?.trim() || "Không có tiêu đề";

    if (!rawChapterInput) {
      safeUnlink(req.file?.path);
      return res
        .status(400)
        .json({ success: false, message: "Số chapter không hợp lệ." });
    }

    const chapterNumber =
      rawChapterInput.toLowerCase() === "oneshot" ? "Oneshot" : rawChapterInput;

    const existed = await Chapter.findOne({ manga: manga._id, chapterNumber });
    if (existed) {
      if (existed.isDeleted) {
        await Chapter.deleteOne({ _id: existed._id });
      } else {
        safeUnlink(req.file?.path);
        return res
          .status(409)
          .json({ success: false, message: "Chapter này đã tồn tại." });
      }
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng chọn file ZIP." });
    }

    try {
      const zip = new AdmZip(req.file.path);
      let entries = zip.getEntries();

      entries = entries.filter((entry) => {
        if (entry.isDirectory) return false;
        const ext = path.extname(entry.entryName).toLowerCase();
        return [".jpg", ".jpeg", ".png", ".webp", ".jfif"].includes(ext);
      });

      entries.sort((a, b) =>
        a.entryName.localeCompare(b.entryName, undefined, {
          numeric: true,
          sensitivity: "base",
        }),
      );

      if (entries.length === 0) {
        return res.status(400).json({
          success: false,
          message: "File ZIP không chứa ảnh hợp lệ (jpg/jpeg/png/webp/jfif).",
        });
      }

      const pages = await runWithConcurrency(
        entries,
        UPLOAD_CONCURRENCY,
        async (entry, i) => {
          const index = i + 1;
          const ext = path.extname(entry.entryName).toLowerCase();
          const tempImage = path.join(
            os.tmpdir(),
            `${Date.now()}-${index}${ext}`,
          );

          fs.writeFileSync(tempImage, entry.getData());

          const finalImagePath = await ensureUnderSizeLimit(
            tempImage,
            index,
            entry.entryName,
          );

          const imageUrl = await uploadChapterPageImage(
            finalImagePath,
            `manganest/chapters/${manga.slug}/${chapterNumber}`,
            { provider: "cloudinary" },
          );

          safeUnlink(finalImagePath);
          return imageUrl;
        },
      );

      const chapter = await Chapter.create({
        manga: manga._id,
        chapterNumber,
        chapterOrder: parseFloat(chapterNumber) || 999999,
        title,
        pages,
        totalPages: pages.length,
        uploadedBy: req.user._id,
      });

      manga.totalChapters = await Chapter.countDocuments({ manga: manga._id });

      const latestChapter = await Chapter.findOne({ manga: manga._id })
        .sort({ chapterOrder: -1 })
        .select("chapterNumber chapterOrder")
        .lean();

      manga.lastChapter = latestChapter ? latestChapter.chapterNumber : "0";
      manga.lastUpdated = new Date();
      await manga.save();

      // Thông báo cho người theo dõi (in-app + web push) — giữ nguyên logic web
      const followers = await User.find({ followedManga: manga._id });
      for (const follower of followers) {
        await Notification.create({
          user: follower._id,
          title: "📚 Chương mới",
          message: `${manga.title} vừa cập nhật Chương ${rawChapterInput}`,
          link: `/manga/${manga.slug}/chapter/${rawChapterInput}`,
          image: manga.cover,
          isRead: false,
        });
      }

      const pushFollowers = await User.find({
        followedManga: manga._id,
        pushSubscription: { $ne: null },
      });

      const baseUrl = `${req.protocol}://${req.get("host")}`;
      const resolveImageUrl = (imgPath) => {
        if (!imgPath) return "";
        return imgPath.startsWith("http") ? imgPath : `${baseUrl}${imgPath}`;
      };

      for (const follower of pushFollowers) {
        const payload = JSON.stringify({
          title: "📚 Truyện bạn theo dõi có chương mới!",
          body: `${manga.title} vừa mới được đăng chapter ${rawChapterInput}!`,
          icon: manga.cover
            ? resolveImageUrl(manga.cover)
            : `${baseUrl}/images/logo.png`,
          image: resolveImageUrl(manga.banner),
          url: `/manga/${manga.slug}/chapter/${rawChapterInput}`,
        });
        sendPushNotification(follower._id, follower.pushSubscription, payload);
      }

      return res.json({
        success: true,
        message: "Upload chapter thành công.",
        chapter: {
          id: chapter._id,
          chapterNumber: chapter.chapterNumber,
          totalPages: chapter.totalPages,
        },
      });
    } finally {
      safeUnlink(req.file?.path);
    }
  } catch (err) {
    console.error("[api/upload/uploadChapter]", err);
    return res
      .status(500)
      .json({ success: false, message: err.message || "Có lỗi xảy ra." });
  }
};

// =========================
// GET /api/v1/upload/my-manga  (danh sách truyện của tôi + thống kê)
// =========================
exports.myManga = async (req, res) => {
  try {
    const mangas = await Manga.find({ translator: req.user._id })
      .sort({ updatedAt: -1 })
      .lean();

    const totalManga = mangas.length;
    const totalChapter = mangas.reduce(
      (sum, m) => sum + (m.totalChapters || 0),
      0,
    );
    const totalViews = mangas.reduce((sum, m) => sum + (m.views || 0), 0);
    const totalFollowers = mangas.reduce((sum, m) => sum + (m.follows || 0), 0);

    return res.json({
      success: true,
      mangas,
      stats: { totalManga, totalChapter, totalViews, totalFollowers },
    });
  } catch (err) {
    console.error("[api/upload/myManga]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =========================
// GET /api/v1/upload/my-manga/:slug  (quản lý 1 truyện + danh sách chapter)
// =========================
exports.mangaDetail = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    }).lean();

    if (!manga) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy truyện." });
    }

    let chapters = await Chapter.find({ manga: manga._id })
      .select("-pages")
      .lean();

    const getChapterValue = (value) => {
      const text = String(value).trim();
      if (text.toLowerCase() === "oneshot") return Number.MAX_SAFE_INTEGER;
      const num = parseFloat(text);
      if (!isNaN(num)) return num;
      return Number.MAX_SAFE_INTEGER - 1;
    };

    chapters.sort(
      (a, b) => getChapterValue(b.chapterNumber) - getChapterValue(a.chapterNumber),
    );

    return res.json({ success: true, manga, chapters });
  } catch (err) {
    console.error("[api/upload/mangaDetail]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

// =========================
// POST /api/v1/upload/my-manga/:slug/edit  (sửa thông tin truyện)
// =========================
exports.updateManga = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy truyện." });
    }

    manga.title = req.body.title || manga.title;
    manga.alternativeTitles = req.body.alternativeTitles
      ? req.body.alternativeTitles
          .split(",")
          .map((i) => i.trim())
          .filter((i) => i !== "")
      : [];
    manga.author = req.body.author || manga.author;
    manga.description = req.body.description
      ? req.body.description.trim()
      : manga.description;
    manga.publishStatus = req.body.publishStatus || manga.publishStatus;
    manga.genres = req.body.genres
      ? Array.isArray(req.body.genres)
        ? req.body.genres
        : [req.body.genres]
      : manga.genres;
    manga.lastUpdated = new Date();

    await manga.save();

    return res.json({ success: true, message: "Đã cập nhật truyện." });
  } catch (err) {
    console.error("[api/upload/updateManga]", err);
    return res
      .status(500)
      .json({ success: false, message: "Cập nhật thất bại." });
  }
};

// =========================
// POST /api/v1/upload/my-manga/:slug/cover  (đổi cover, multipart: cover)
// =========================
exports.changeCover = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      safeUnlink(req.file?.path);
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy truyện." });
    }

    if (!req.file) {
      return res.status(400).json({ success: false, message: "Chưa chọn ảnh." });
    }

    try {
      if (manga.coverPublicId) {
        await deleteUploadedImage(manga.coverPublicId);
      }

      const uploaded = await uploadImage(req.file.path, "manganest/covers", {
        provider: "supabase",
      });

      manga.cover = uploaded.url;
      manga.coverPublicId = uploaded.public_id;
      await manga.save();

      return res.json({ success: true, message: "Đổi Cover thành công.", cover: manga.cover });
    } finally {
      safeUnlink(req.file?.path);
    }
  } catch (err) {
    console.error("[api/upload/changeCover]", err);
    return res
      .status(500)
      .json({ success: false, message: "Không thể đổi Cover." });
  }
};

// =========================
// POST /api/v1/upload/my-manga/:slug/banner  (đổi banner, multipart: banner)
// =========================
exports.changeBanner = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      safeUnlink(req.file?.path);
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy truyện." });
    }

    if (!req.file) {
      return res
        .status(400)
        .json({ success: false, message: "Vui lòng chọn Banner." });
    }

    try {
      if (manga.bannerPublicId) {
        await deleteUploadedImage(manga.bannerPublicId);
      }

      const uploaded = await uploadImage(req.file.path, "manganest/banners", {
        provider: "supabase",
      });

      manga.banner = uploaded.url;
      manga.bannerPublicId = uploaded.public_id;
      await manga.save();

      return res.json({
        success: true,
        message: "Đổi Banner thành công.",
        banner: manga.banner,
      });
    } finally {
      safeUnlink(req.file?.path);
    }
  } catch (err) {
    console.error("[api/upload/changeBanner]", err);
    return res
      .status(500)
      .json({ success: false, message: "Không thể đổi Banner." });
  }
};

// =========================
// DELETE /api/v1/upload/my-manga/:slug  (xóa truyện, chỉ khi hết chapter)
// =========================
exports.deleteManga = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy truyện." });
    }

    const totalChapter = await Chapter.countDocuments({
      manga: manga._id,
      isDeleted: { $ne: true },
    });

    if (totalChapter > 0) {
      return res.status(400).json({
        success: false,
        message: "Không thể xóa truyện khi vẫn còn Chapter.",
      });
    }

    if (manga.coverPublicId) await deleteUploadedImage(manga.coverPublicId);
    if (manga.bannerPublicId) await deleteUploadedImage(manga.bannerPublicId);

    await Manga.deleteOne({ _id: manga._id });

    return res.json({ success: true, message: "Đã xóa truyện." });
  } catch (err) {
    console.error("[api/upload/deleteManga]", err);
    return res
      .status(500)
      .json({ success: false, message: "Không thể xóa truyện." });
  }
};

// =========================
// DELETE /api/v1/upload/my-manga/:slug/chapter/:id  (xóa 1 chapter)
// =========================
exports.deleteChapter = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy truyện." });
    }

    const chapter = await Chapter.findOne({
      _id: req.params.id,
      manga: manga._id,
    });

    if (!chapter) {
      return res
        .status(404)
        .json({ success: false, message: "Không tìm thấy Chapter." });
    }

    const chapterFolder = `manganest/chapters/${manga.slug}/${chapter.chapterNumber}`;

    try {
      await cloudinary.api.delete_resources_by_prefix(chapterFolder);
      await cloudinary.api.delete_folder(chapterFolder);
    } catch (err) {
      console.log("Cloudinary:", err.message);
    }

    try {
      await uploadChapterPageImage.deleteByPrefix(chapterFolder);
    } catch (err) {
      console.log("Supabase:", err.message);
    }

    await Chapter.deleteOne({ _id: chapter._id });

    manga.totalChapters = await Chapter.countDocuments({ manga: manga._id });

    const lastChapter = await Chapter.find({ manga: manga._id })
      .sort({ chapterOrder: -1 })
      .limit(1);

    manga.lastChapter = lastChapter.length > 0 ? lastChapter[0].chapterNumber : "0";
    manga.lastUpdated = new Date();
    await manga.save();

    return res.json({ success: true, message: "Đã xóa Chapter." });
  } catch (err) {
    console.error("[api/upload/deleteChapter]", err);
    return res
      .status(500)
      .json({ success: false, message: "Không thể xóa Chapter." });
  }
};

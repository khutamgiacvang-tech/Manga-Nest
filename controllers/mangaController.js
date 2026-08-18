const Manga = require("../models/Manga");
const Chapter = require("../models/Chapter");
const slugify = require("slugify");
const fs = require("fs-extra");
const path = require("path");
const AdmZip = require("adm-zip");
const User = require("../models/User");
const Notification = require("../models/Notification");
const ReadingHistory = require("../models/ReadingHistory");
const ChapterView = require("../models/ChapterView");
const Comment = require("../models/Comment");
const Category = require("../models/Category");
const removeVietnameseTones = require("../utils/removeVietnameseTones");
const webpush = require("web-push");
const uploadImage = require("../utils/cloudinaryUpload");
const cloudinary = require("../config/cloudinary");
const timeAgo = require("../utils/timeAgo");
const sharp = require("sharp");

// =========================
// Giới hạn dung lượng ảnh khi upload lên Cloudinary
// =========================
const MAX_IMAGE_SIZE = 10 * 1024 * 1024; // 10MB

// =========================
// Số lượng ảnh upload SONG SONG cùng lúc lên Cloudinary khi xử lý 1
// chapter. Trước đây code upload TUẦN TỰ từng trang một (for...await),
// khiến 1 chapter 20-30 trang mất rất lâu vì phải chờ trang trước
// xong mới upload trang sau. Giờ upload song song tối đa
// UPLOAD_CONCURRENCY trang cùng lúc để rút ngắn thời gian, nhưng vẫn
// giới hạn số lượng để tránh bắn quá nhiều request cùng lúc gây lỗi
// rate limit (429) từ Cloudinary, đặc biệt là các gói free.
// =========================
const UPLOAD_CONCURRENCY = 5;

// =========================
// Chạy 1 danh sách task song song nhưng giới hạn số lượng chạy cùng
// lúc (concurrency). Kết quả trả về đúng theo thứ tự ban đầu của
// `items`, dù các task hoàn thành không theo thứ tự đó.
// =========================
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

// =========================
// Nén ảnh nếu vượt quá giới hạn dung lượng
// =========================
// Nếu ảnh gốc <= 10MB thì trả về nguyên path gốc.
// Nếu > 10MB thì nén dần bằng sharp (giảm quality) tới khi đạt giới
// hạn hoặc quality xuống quá thấp (30%) thì báo lỗi rõ ràng.
// File gốc quá lớn sẽ bị xóa, chỉ giữ lại bản đã nén.
// =========================
async function ensureUnderSizeLimit(imagePath, index, entryName) {
  let stats = fs.statSync(imagePath);

  if (stats.size <= MAX_IMAGE_SIZE) {
    return imagePath;
  }

  const compressedPath = imagePath + "_compressed.jpg";

  let quality = 80;

  await sharp(imagePath).jpeg({ quality }).toFile(compressedPath);

  stats = fs.statSync(compressedPath);

  while (stats.size > MAX_IMAGE_SIZE && quality > 30) {
    quality -= 15;

    await sharp(imagePath).jpeg({ quality }).toFile(compressedPath);

    stats = fs.statSync(compressedPath);
  }

  // Xóa file gốc quá lớn
  fs.unlinkSync(imagePath);

  if (stats.size > MAX_IMAGE_SIZE) {
    fs.unlinkSync(compressedPath);

    throw new Error(
      `Trang ${index} (${entryName}) vẫn vượt quá 10MB sau khi nén (quality ${quality}%). Vui lòng nén ảnh thủ công trước khi upload.`,
    );
  }

  console.log(
    `Đã nén trang ${index} (${entryName}) xuống ${(stats.size / 1024 / 1024).toFixed(1)}MB (quality ${quality}%)`,
  );

  return compressedPath;
}

// =========================
// Trang tạo truyện
// =========================

exports.showCreate = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      req.flash("error", "Vui lòng đăng nhập.");
      return res.redirect("/");
    }

    if (req.user.role !== "translator") {
      req.flash("error", "Bạn không có quyền.");
      return res.redirect("/");
    }

    const allGenres = await Category.find().sort({ name: 1 }).lean();

    res.render("manga/create", {
      title: "Đăng truyện",
      allGenres,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/");
  }
};

// =========================
// Tạo truyện
// =========================

exports.create = async (req, res) => {
  try {
    const { title, alternativeTitles, author, description, status } = req.body;

    let slug = slugify(title, {
      lower: true,
      strict: true,
      locale: "vi",
    });

    let count = 1;

    while (await Manga.findOne({ slug })) {
      slug =
        slugify(title, {
          lower: true,
          strict: true,
          locale: "vi",
        }) +
        "-" +
        count;
      count++;
    }

    let cover = "";
    let coverPublicId = "";

    let banner = "";
    let bannerPublicId = "";

    if (req.files?.cover) {
      const uploadedCover = await uploadImage(
        req.files.cover[0].path,
        "manganest/covers",
      );

      cover = uploadedCover.url;
      coverPublicId = uploadedCover.public_id;

      if (fs.existsSync(req.files.cover[0].path)) {
        fs.unlinkSync(req.files.cover[0].path);
      }
    }

    if (req.files?.banner) {
      const uploadedBanner = await uploadImage(
        req.files.banner[0].path,
        "manganest/banners",
      );

      banner = uploadedBanner.url;
      bannerPublicId = uploadedBanner.public_id;

      if (fs.existsSync(req.files.banner[0].path)) {
        fs.unlinkSync(req.files.banner[0].path);
      }
    }

    const genres = req.body.genres
      ? Array.isArray(req.body.genres)
        ? req.body.genres
        : [req.body.genres]
      : [];

    const manga = new Manga({
      title,
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
      author,
      description: description ? description.trim() : description,
      genres,
      publishStatus: status,
      status: "pending",
      translator: req.user._id,
    });
    await manga.save();

    // ==========================
    // Thông báo cho Admin
    // ==========================

    const admins = await User.find({
      role: "admin",
    });

    for (const admin of admins) {
      await Notification.create({
        user: admin._id,
        title: "📖 Truyện mới chờ duyệt",
        message: `${req.user.username} vừa upload truyện "${manga.title}".`,
        link: "/admin",
        image: manga.cover,
      });
    }

    req.flash("success", "Đăng truyện thành công.");
    res.redirect(`/upload/${slug}/chapter`);
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/upload");
  }
};

// =========================
// Trang upload chapter
// =========================

exports.showUploadChapter = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }

    const manga = await Manga.findOne({
      slug: req.params.slug,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/upload");
    }

    res.render("manga/uploadChapter", {
      title: "Upload Chapter",
      manga,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/upload");
  }
};

// =========================
// Upload chapter
// =========================
// LƯU Ý: đã bọc toàn bộ logic vào try/finally để đảm bảo file zip tạm
// (req.file.path do multer lưu vào thư mục temp) LUÔN được xóa, dù
// upload thành công hay có lỗi xảy ra ở bất kỳ bước nào. Trước đây
// việc unlink chỉ nằm ở nhánh thành công nên mỗi lần lỗi giữa chừng
// (trùng chapter, giải nén lỗi, DB lỗi...) là 1 file zip bị bỏ quên
// trong thư mục temp.
//
// Đồng thời tự động nén ảnh nào vượt quá 10MB (giới hạn Cloudinary)
// bằng sharp trước khi upload, thay vì để Cloudinary throw lỗi giữa
// chừng gây khó hiểu.
//
// TỐI ƯU TỐC ĐỘ: upload các trang lên Cloudinary SONG SONG (tối đa
// UPLOAD_CONCURRENCY trang cùng lúc) thay vì tuần tự từng trang một,
// nhờ vậy giảm đáng kể thời gian chờ khi upload chapter nhiều trang.
// `runWithConcurrency` vẫn đảm bảo mảng `pages` trả về đúng thứ tự
// trang gốc dù các upload hoàn thành không theo thứ tự.
// =========================

exports.uploadChapter = async (req, res) => {
  try {
    console.log("1. Tìm manga");

    const manga = await Manga.findOne({
      slug: req.params.slug,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy manga.");
      return res.redirect("/upload");
    }

    console.log("2. Đã tìm thấy manga:", manga.title);

    const rawChapterInput = req.body.chapterNumber?.trim();
    const title = req.body.title?.trim() || "Không có tiêu đề";

    if (!rawChapterInput) {
      req.flash("error", "Số chapter không hợp lệ.");
      return res.redirect(`/upload/${manga.slug}/chapter`);
    }

    // Chuẩn hóa chapter
    const chapterNumber =
      rawChapterInput.toLowerCase() === "oneshot" ? "Oneshot" : rawChapterInput;

    // Kiểm tra trùng chapter
    const existed = await Chapter.findOne({
      manga: manga._id,
      chapterNumber,
    });

    if (existed) {
      if (existed.isDeleted) {
        // Chapter này trước đó đã bị Admin xóa (chỉ còn bản ghi rỗng để lưu
        // lịch sử/lý do) -> xóa hẳn bản ghi cũ để translator upload lại
        // bình thường, không bị unique index chặn.
        await Chapter.deleteOne({ _id: existed._id });
      } else {
        req.flash("error", "Chapter này đã tồn tại.");
        return res.redirect(`/upload/${manga.slug}/chapter`);
      }
    }

    if (!req.file) {
      req.flash("error", "Vui lòng chọn file ZIP.");
      return res.redirect(`/upload/${manga.slug}/chapter`);
    }

    console.log("3. Giải nén ZIP");

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

    const os = require("os");

    console.log(
      `3b. Upload ${entries.length} trang (song song, tối đa ${UPLOAD_CONCURRENCY} cùng lúc)`,
    );

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

        // Nén ảnh nếu vượt quá 10MB, trả về path cuối cùng để upload
        const finalImagePath = await ensureUnderSizeLimit(
          tempImage,
          index,
          entry.entryName,
        );

        const imageUrl = await uploadImage(
          finalImagePath,
          `manganest/chapters/${manga.slug}/${chapterNumber}`,
        );

        if (fs.existsSync(finalImagePath)) {
          fs.unlinkSync(finalImagePath);
        }

        return imageUrl;
      },
    );

    console.log("4. Upload Cloudinary xong");

    await Chapter.create({
      manga: manga._id,
      chapterNumber,
      chapterOrder: parseFloat(chapterNumber) || 999999,
      title,
      pages,
      totalPages: pages.length,
      uploadedBy: req.user._id,
    });

    console.log("5. Đã tạo Chapter");

    // ======================
    // Cập nhật thông tin Manga
    // ======================

    manga.totalChapters = await Chapter.countDocuments({
      manga: manga._id,
    });

    // Lấy chapter mới nhất theo chapterOrder
    const latestChapter = await Chapter.findOne({
      manga: manga._id,
    })
      .sort({ chapterOrder: -1 })
      .select("chapterNumber chapterOrder")
      .lean();

    if (latestChapter) {
      manga.lastChapter = latestChapter.chapterNumber;
    } else {
      manga.lastChapter = "0";
    }

    manga.lastUpdated = new Date();

    await manga.save();

    console.log("9. Đã cập nhật Manga");

    // =========================
    // GỬI THÔNG BÁO (IN-APP)
    // =========================

    const followers = await User.find({
      followedManga: manga._id,
    });

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

    // =========================
    // GỬI WEB PUSH NOTIFICATION
    // =========================

    const pushFollowers = await User.find({
      followedManga: manga._id,
      pushSubscription: { $ne: null },
    });

    const baseUrl = `${req.protocol}://${req.get("host")}`;

    // Cover/banner giờ đã là URL tuyệt đối từ Cloudinary (https://...),
    // không còn là đường dẫn tương đối như trước nữa. Nếu ghép thẳng
    // baseUrl vào phía trước sẽ ra URL hỏng (http://localhost:3000https://...).
    // Hàm này chỉ ghép baseUrl khi ảnh còn là đường dẫn tương đối cũ,
    // còn URL tuyệt đối (http/https) thì dùng thẳng.
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

      webpush
        .sendNotification(follower.pushSubscription, payload)
        .catch((err) => console.error("Lỗi gửi push notification:", err));
    }

    console.log("10. Thành công");
    req.flash("success", "Upload chapter thành công.");
    return res.redirect(`/my-manga/${manga.slug}`);
  } catch (err) {
    console.error("========== ERROR ==========");
    console.error(err);
    req.flash("error", err.message);
    return res.redirect(`/upload/${req.params.slug}/chapter`);
  } finally {
    // Luôn xóa file zip tạm trong thư mục temp, dù thành công hay lỗi
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (cleanupErr) {
        console.error("Không thể xóa file tạm:", cleanupErr);
      }
    }
  }
};

// =========================
// Danh sách truyện của tôi
// =========================

exports.myManga = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      req.flash("error", "Vui lòng đăng nhập.");
      return res.redirect("/");
    }

    const mangas = await Manga.find({
      translator: req.user._id,
    }).sort({
      updatedAt: -1,
    });

    const pending = mangas.filter((m) => m.status === "pending");
    const approved = mangas.filter((m) => m.status === "approved");
    const rejected = mangas.filter((m) => m.status === "rejected");
    const hidden = mangas.filter((m) => m.status === "hidden");

    const totalManga = mangas.length;
    const totalChapter = mangas.reduce(
      (sum, manga) => sum + (manga.totalChapters || 0),
      0,
    );
    const totalViews = mangas.reduce(
      (sum, manga) => sum + (manga.views || 0),
      0,
    );
    const totalFollowers = mangas.reduce(
      (sum, manga) => sum + (manga.follows || 0),
      0,
    );

    res.render("manga/myManga", {
      title: "Truyện của tôi",
      pending,
      approved,
      rejected,
      hidden,
      totalManga,
      totalChapter,
      totalViews,
      totalFollowers,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/");
  }
};

// =========================
// Quản lý 1 truyện
// =========================

exports.manageManga = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }

    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    let chapters = await Chapter.find({
      manga: manga._id,
    }).lean();

    const getChapterValue = (value) => {
      const text = String(value).trim();

      if (text.toLowerCase() === "oneshot") {
        return Number.MAX_SAFE_INTEGER;
      }

      const num = parseFloat(text);

      if (!isNaN(num)) {
        return num;
      }

      return Number.MAX_SAFE_INTEGER - 1;
    };

    chapters.sort((a, b) => {
      return (
        getChapterValue(b.chapterNumber) - getChapterValue(a.chapterNumber)
      );
    });

    res.render("manga/manage", {
      title: manga.title,
      manga,
      chapters,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/my-manga");
  }
};

// =========================
// Trang sửa truyện
// =========================

exports.showEdit = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    const allGenres = await Category.find().sort({ name: 1 }).lean();

    res.render("manga/edit", {
      title: "Sửa truyện",
      manga,
      allGenres,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/my-manga");
  }
};

// =========================
// Update truyện
// =========================

exports.updateManga = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    manga.title = req.body.title;
    manga.alternativeTitles = req.body.alternativeTitles
      ? req.body.alternativeTitles
          .split(",")
          .map((i) => i.trim())
          .filter((i) => i !== "")
      : [];
    manga.author = req.body.author;
    manga.description = req.body.description
      ? req.body.description.trim()
      : req.body.description;
    manga.publishStatus = req.body.publishStatus;
    manga.genres = req.body.genres
      ? Array.isArray(req.body.genres)
        ? req.body.genres
        : [req.body.genres]
      : [];
    manga.lastUpdated = new Date();

    await manga.save();
    req.flash("success", "Đã cập nhật truyện.");
    res.redirect("/my-manga/" + manga.slug);
  } catch (err) {
    console.log(err);
    req.flash("error", "Cập nhật thất bại.");
    res.redirect("back");
  }
};

// =========================
// Trang đổi cover
// =========================

exports.showChangeCover = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    res.render("manga/changeCover", {
      title: "Đổi Cover",
      manga,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi.");
    res.redirect("/my-manga");
  }
};

// =========================
// Đổi Cover
// =========================

exports.changeCover = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    if (!req.file) {
      req.flash("error", "Chưa chọn ảnh.");
      return res.redirect(`/my-manga/${manga.slug}/cover`);
    }

    // =========================
    // Xóa cover cũ trên Cloudinary
    // =========================

    if (manga.coverPublicId) {
      try {
        await cloudinary.uploader.destroy(manga.coverPublicId);
      } catch (err) {
        console.log("Không thể xóa cover cũ:", err.message);
      }
    }

    // =========================
    // Upload cover mới
    // =========================

    const uploaded = await uploadImage(req.file.path, "manganest/covers");

    // Xóa file tạm
    fs.unlinkSync(req.file.path);

    // =========================
    // Cập nhật Manga
    // =========================

    manga.cover = uploaded.url;
    manga.coverPublicId = uploaded.public_id;

    await manga.save();

    req.flash("success", "Đổi Cover thành công.");
    res.redirect("/my-manga/" + manga.slug);
  } catch (err) {
    console.error(err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    req.flash("error", "Không thể đổi Cover.");
    res.redirect("back");
  }
};

// =========================
// Trang đổi Banner
// =========================

exports.showChangeBanner = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    res.render("manga/changeBanner", {
      title: "Đổi Banner",
      manga,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/my-manga");
  }
};

// =========================
// Đổi Banner
// =========================

exports.changeBanner = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    if (!req.file) {
      req.flash("error", "Vui lòng chọn Banner.");
      return res.redirect(`/my-manga/${manga.slug}/banner`);
    }

    // =========================
    // Xóa Banner cũ trên Cloudinary
    // =========================

    if (manga.bannerPublicId) {
      try {
        await cloudinary.uploader.destroy(manga.bannerPublicId);
      } catch (err) {
        console.log("Không thể xóa banner cũ:", err.message);
      }
    }

    // =========================
    // Upload Banner mới
    // =========================

    const uploaded = await uploadImage(req.file.path, "manganest/banners");

    // Xóa file tạm
    fs.unlinkSync(req.file.path);

    // =========================
    // Cập nhật Manga
    // =========================

    manga.banner = uploaded.url;
    manga.bannerPublicId = uploaded.public_id;

    await manga.save();

    req.flash("success", "Đổi Banner thành công.");
    res.redirect("/my-manga/" + manga.slug);
  } catch (err) {
    console.error(err);

    if (req.file && fs.existsSync(req.file.path)) {
      fs.unlinkSync(req.file.path);
    }

    req.flash("error", "Không thể đổi Banner.");
    res.redirect("back");
  }
};

// =========================
// Xóa truyện
// =========================

exports.deleteManga = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    // Không cho xóa nếu còn chapter (không tính chương đã bị Admin xóa)
    const totalChapter = await Chapter.countDocuments({
      manga: manga._id,
      isDeleted: { $ne: true },
    });

    if (totalChapter > 0) {
      req.flash("error", "Không thể xóa truyện khi vẫn còn Chapter.");
      return res.redirect("/my-manga/" + manga.slug);
    }

    // =========================
    // Xóa Cover
    // =========================

    try {
      if (manga.coverPublicId) {
        await cloudinary.uploader.destroy(manga.coverPublicId);
      }
    } catch (err) {
      console.log("Không xóa được cover:", err.message);
    }

    // =========================
    // Xóa Banner
    // =========================

    try {
      if (manga.bannerPublicId) {
        await cloudinary.uploader.destroy(manga.bannerPublicId);
      }
    } catch (err) {
      console.log("Không xóa được banner:", err.message);
    }

    // =========================
    // Xóa truyện
    // =========================

    await Manga.deleteOne({
      _id: manga._id,
    });

    req.flash("success", "Đã xóa truyện.");
    res.redirect("/my-manga");
  } catch (err) {
    console.error(err);

    req.flash("error", "Không thể xóa truyện.");
    res.redirect("back");
  }
};

// =========================
// Xóa Chapter
// =========================

exports.deleteChapter = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    const chapter = await Chapter.findOne({
      _id: req.params.id,
      manga: manga._id,
    });

    if (!chapter) {
      req.flash("error", "Không tìm thấy Chapter.");
      return res.redirect("/my-manga/" + manga.slug);
    }

    // =========================
    // Xóa ảnh trên Cloudinary
    // =========================

    try {
      await cloudinary.api.delete_resources_by_prefix(
        `manganest/chapters/${manga.slug}/${chapter.chapterNumber}`,
      );

      await cloudinary.api.delete_folder(
        `manganest/chapters/${manga.slug}/${chapter.chapterNumber}`,
      );
    } catch (err) {
      console.log("Cloudinary:", err.message);
    }

    // =========================
    // Xóa chapter trong MongoDB
    // =========================

    await Chapter.deleteOne({
      _id: chapter._id,
    });

    // =========================
    // Cập nhật Manga
    // =========================

    manga.totalChapters = await Chapter.countDocuments({
      manga: manga._id,
    });

    const lastChapter = await Chapter.find({
      manga: manga._id,
    })
      .sort({ chapterOrder: -1 })
      .limit(1);

    manga.lastChapter =
      lastChapter.length > 0 ? lastChapter[0].chapterNumber : "0";

    manga.lastUpdated = new Date();

    await manga.save();

    req.flash("success", "Đã xóa Chapter.");
    res.redirect("/my-manga/" + manga.slug);
  } catch (err) {
    console.error(err);

    req.flash("error", "Không thể xóa Chapter.");

    res.redirect("back");
  }
};

// =========================
// Trang sửa Chapter
// =========================

exports.showEditChapter = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }

    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    const chapter = await Chapter.findOne({
      _id: req.params.id,
      manga: manga._id,
    });

    if (!chapter) {
      req.flash("error", "Không tìm thấy Chapter.");
      return res.redirect("/my-manga/" + manga.slug);
    }

    res.render("manga/editChapter", {
      title: "Sửa Chapter",
      manga,
      chapter,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/my-manga");
  }
};

// =========================
// Trạng thái Chapter (bị Admin ẩn / xóa - xem lý do)
// =========================

exports.chapterStatus = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.redirect("/");
    }

    const manga = await Manga.findOne({
      slug: req.params.slug,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    const isOwner = manga.translator.toString() === req.user._id.toString();
    const isAdmin = req.user.role === "admin";

    if (!isOwner && !isAdmin) {
      req.flash("error", "Bạn không có quyền xem trang này.");
      return res.redirect("/my-manga");
    }

    const chapter = await Chapter.findOne({
      _id: req.params.id,
      manga: manga._id,
    }).lean();

    if (!chapter) {
      req.flash("error", "Không tìm thấy Chapter.");
      return res.redirect("/my-manga/" + manga.slug);
    }

    const { FANPAGE_URL } = require("../config/site");

    res.render("manga/chapterStatus", {
      title: "Trạng thái Chapter",
      manga,
      chapter,
      fanpageUrl: FANPAGE_URL,
    });
  } catch (err) {
    console.log(err);
    req.flash("error", "Có lỗi xảy ra.");
    res.redirect("/my-manga");
  }
};

// =========================
// Cập nhật Chapter (Hỗ trợ thay đổi title và ghi đè ảnh ZIP mới)
// =========================
// LƯU Ý: cũng bọc trong try/finally để file zip tạm luôn được xóa,
// kể cả khi có lỗi xảy ra trong lúc giải nén / ghi file / lưu DB.
//
// FIX QUAN TRỌNG: upload ảnh MỚI xong hoàn tất rồi mới xóa ảnh CŨ trên
// Cloudinary. Trước đây xóa ảnh cũ trước, nếu upload ảnh mới lỗi giữa
// chừng thì DB vẫn giữ URL cũ nhưng ảnh thật đã bị xóa → chapter mất
// ảnh vĩnh viễn. Ảnh mới được upload lên một folder tạm, chỉ sau khi
// TOÀN BỘ ảnh upload thành công mới xóa folder cũ và gán pages mới.
//
// Đồng thời tự động nén ảnh nào vượt quá 10MB bằng sharp trước khi
// upload, thay vì throw lỗi ngay.
//
// SAU KHI xóa ảnh cũ xong, rename từng ảnh từ folder TẠM về lại folder
// chuẩn (đúng tên chapterNumber) rồi xóa folder tạm rỗng, để Cloudinary
// không bị tồn folder rác dạng "1_temp_1784773678600".
//
// TỐI ƯU TỐC ĐỘ: upload ảnh mới lên folder tạm SONG SONG (tối đa
// UPLOAD_CONCURRENCY cùng lúc) giống hệt uploadChapter, thay vì tuần
// tự từng trang một.
// =========================

exports.updateChapter = async (req, res) => {
  try {
    const manga = await Manga.findOne({
      slug: req.params.slug,
      translator: req.user._id,
    });

    if (!manga) {
      req.flash("error", "Không tìm thấy truyện.");
      return res.redirect("/my-manga");
    }

    const chapter = await Chapter.findOne({
      _id: req.params.id,
      manga: manga._id,
    });

    if (!chapter) {
      req.flash("error", "Không tìm thấy Chapter.");
      return res.redirect("/my-manga/" + manga.slug);
    }

    // Cập nhật tiêu đề
    // LƯU Ý: dùng !== undefined thay vì if (req.body.title) vì chuỗi rỗng
    // "" là falsy -> nếu người dùng xóa hết tiêu đề để lưu rỗng thì code
    // cũ sẽ bỏ qua, không cập nhật được, khiến title cũ bị giữ nguyên.
    if (req.body.title !== undefined) {
      chapter.title = req.body.title.trim();
    }

    // =========================
    // Cập nhật số Chapter (nếu người dùng đổi số chương)
    // =========================
    // Lưu lại số chương CŨ trước khi đổi, vì ảnh trên Cloudinary đang
    // nằm trong folder được đặt tên theo số chương CŨ.
    const oldChapterNumber = chapter.chapterNumber;
    let numberChanged = false;

    if (
      req.body.chapterNumber !== undefined &&
      req.body.chapterNumber !== null &&
      req.body.chapterNumber.toString().trim() !== ""
    ) {
      const rawChapterInput = req.body.chapterNumber.toString().trim();
      const newChapterNumber =
        rawChapterInput.toLowerCase() === "oneshot"
          ? "Oneshot"
          : rawChapterInput;

      if (newChapterNumber !== oldChapterNumber) {
        // Kiểm tra trùng số chương với chapter khác trong cùng manga
        const existed = await Chapter.findOne({
          manga: manga._id,
          chapterNumber: newChapterNumber,
          _id: { $ne: chapter._id },
        });

        if (existed) {
          if (existed.isDeleted) {
            // Chapter cũ đã bị Admin xóa (chỉ còn bản ghi rỗng để lưu lịch
            // sử) -> xóa hẳn để giải phóng số chương này
            await Chapter.deleteOne({ _id: existed._id });
          } else {
            req.flash("error", "Chapter này đã tồn tại.");
            return res.redirect("back");
          }
        }

        chapter.chapterNumber = newChapterNumber;
        chapter.chapterOrder = parseFloat(newChapterNumber) || 999999;
        numberChanged = true;
      }
    }

    // Folder Cloudinary CŨ (theo số chương cũ) và folder CHUẨN mới (theo
    // số chương hiện tại sau khi cập nhật ở trên, có thể trùng folder cũ
    // nếu người dùng không đổi số chương)
    const oldFolder = `manganest/chapters/${manga.slug}/${oldChapterNumber}`;
    const finalFolder = `manganest/chapters/${manga.slug}/${chapter.chapterNumber}`;

    // Nếu upload ZIP mới
    if (req.file) {
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

      const os = require("os");

      // Upload ảnh mới lên folder TẠM (theo số chương MỚI), không đụng
      // tới ảnh cũ
      const tempFolder = `${finalFolder}_temp_${Date.now()}`;

      let pages = [];

      try {
        pages = await runWithConcurrency(
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

            // Nén ảnh nếu vượt quá 10MB
            const finalImagePath = await ensureUnderSizeLimit(
              tempImage,
              index,
              entry.entryName,
            );

            const imageUrl = await uploadImage(finalImagePath, tempFolder);

            if (fs.existsSync(finalImagePath)) {
              fs.unlinkSync(finalImagePath);
            }

            return imageUrl;
          },
        );
      } catch (uploadErr) {
        // Upload ảnh mới thất bại giữa chừng -> dọn rác ở folder tạm,
        // KHÔNG đụng tới ảnh cũ, để chapter vẫn còn nguyên như trước
        try {
          await cloudinary.api.delete_resources_by_prefix(`${tempFolder}/`);
          await cloudinary.api.delete_folder(tempFolder);
        } catch (cleanupErr) {
          console.log("Không dọn được folder tạm:", cleanupErr.message);
        }

        throw uploadErr;
      }

      // Upload ảnh mới đã THÀNH CÔNG hoàn toàn -> giờ mới xóa ảnh cũ.
      //
      // QUAN TRỌNG: bắt buộc thêm dấu "/" vào cuối prefix. Cloudinary so
      // khớp "delete_resources_by_prefix" theo kiểu string prefix thông
      // thường, KHÔNG hiểu ranh giới folder. Nếu không có dấu "/", prefix
      // "manganest/chapters/slug/7" sẽ khớp luôn cả
      // "manganest/chapters/slug/7_temp_169..." (vì chuỗi đó cũng "bắt
      // đầu bằng" "...7"), khiến ảnh MỚI vừa upload lên folder tạm bị xóa
      // nhầm ngay sau khi upload xong -> gây lỗi "Resource not found" khi
      // rename ở bước tiếp theo. Đây chính là nguyên nhân lỗi cũ.
      try {
        await cloudinary.api.delete_resources_by_prefix(`${oldFolder}/`);
        await cloudinary.api.delete_folder(oldFolder);
      } catch (err) {
        // Folder có thể không tồn tại (chapter mới chưa từng có ảnh)
        console.log("Không xóa được ảnh cũ:", err?.message || err);
      }

      // =========================
      // Rename ảnh từ folder TẠM về lại folder chuẩn, để không tồn
      // folder rác "_temp_..." trên Cloudinary
      // =========================
      try {
        const renamedPages = [];

        for (const page of pages) {
          const newPublicId = page.public_id.replace(tempFolder, finalFolder);

          const renamed = await cloudinary.uploader.rename(
            page.public_id,
            newPublicId,
          );

          renamedPages.push({
            url: renamed.secure_url,
            public_id: renamed.public_id,
          });
        }

        pages = renamedPages;

        // tempFolder giờ đã rỗng, xóa nốt cho sạch
        try {
          await cloudinary.api.delete_folder(tempFolder);
        } catch (err) {
          // Cloudinary đôi khi có độ trễ vài trăm ms để cập nhật index sau
          // khi rename xong, nên lần xóa đầu có thể vẫn thấy folder "chưa
          // rỗng" dù thực tế đã rỗng. Đợi 1.5s rồi thử lại 1 lần nữa.
          await new Promise((resolve) => setTimeout(resolve, 1500));

          try {
            await cloudinary.api.delete_folder(tempFolder);
          } catch (err2) {
            console.log(
              "Không xóa được folder tạm rỗng:",
              err2?.message || err2,
            );
          }
        }
      } catch (renameErr) {
        // Rename lỗi thì KHÔNG throw làm hỏng cả request - ảnh vẫn
        // đang tồn tại và dùng được bình thường ở tempFolder, chỉ là
        // tên folder không đẹp. Giữ nguyên pages (chưa rename) để lưu.
        console.log(
          "Không rename được ảnh về folder chuẩn (ảnh vẫn hoạt động bình thường ở folder tạm):",
          renameErr?.message || renameErr,
        );
      }

      chapter.pages = pages;
      chapter.totalPages = pages.length;
    }
    // Nếu KHÔNG upload ZIP mới (kể cả khi có đổi số chương): tuyệt đối
    // không đụng tới Cloudinary. `chapter.pages` giữ nguyên `url` đã lưu
    // sẵn trong DB từ trước, ảnh hiển thị không phụ thuộc vào việc tên
    // folder trên Cloudinary có khớp với `chapterNumber` mới hay không.
    // Trước đây code cố "di chuyển" ảnh sang folder mới bằng
    // `cloudinary.uploader.rename`, việc này thừa và rủi ro: nếu ảnh cũ
    // vì lý do gì đó không còn đúng vị trí ban đầu (ví dụ do một lần sửa
    // ZIP bị lỗi trước đó) thì lệnh rename báo "Resource not found" và
    // parent code coi như lỗi, khiến trải nghiệm sửa chương bị rối. Chỉ
    // cần đổi số chương trong DB là đủ, ảnh cũ vẫn hiển thị bình thường.

    await chapter.save();

    manga.lastUpdated = new Date();
    await manga.save();

    req.flash("success", "Đã cập nhật Chapter thành công.");
    res.redirect("/my-manga/" + manga.slug);
  } catch (err) {
    console.error("========== UPDATE CHAPTER ERROR ==========");
    console.error(err);

    req.flash("error", "Không thể cập nhật Chapter: " + err.message);
    res.redirect("back");
  } finally {
    if (req.file && fs.existsSync(req.file.path)) {
      try {
        fs.unlinkSync(req.file.path);
      } catch (err) {
        console.log(err);
      }
    }
  }
};

// =========================
// Chi tiết truyện
// =========================

exports.showManga = async (req, res) => {
  try {
    // .lean() vì bên dưới không còn gọi manga.save() trong hàm này nữa
    // (view chỉ cần đọc dữ liệu để render) -> bỏ overhead tạo Mongoose
    // document, nhanh hơn đáng kể.
    const manga = await Manga.findOne({
      slug: req.params.slug,
      status: "approved",
    })
      .populate(
        "translator",
        "username displayName avatar followedManga facebook",
      )
      .lean();

    if (!manga) {
      return res.redirect("/");
    }

    // =========================
    // Các query độc lập với nhau -> chạy song song bằng Promise.all
    // thay vì await tuần tự từng cái một. Trước đây mỗi query phải đợi
    // xong query trước mới bắt đầu, cộng dồn latency lại (đặc biệt là
    // network round-trip tới MongoDB Atlas) -> đây là nguyên nhân chính
    // khiến trang chi tiết truyện load chậm.
    // =========================

    let [
      chapters,
      mangaCount,
      chapterCommentCounts,
      totalComments,
      history,
      similarManga,
    ] = await Promise.all([
      Chapter.find({
        manga: manga._id,
        isHidden: { $ne: true },
      }).lean(),

      manga.translator
        ? Manga.countDocuments({
            translator: manga.translator._id,
            status: "approved",
          })
        : Promise.resolve(0),

      // Match theo manga (đã có index) thay vì đợi danh sách chapter
      // xong rồi mới match theo mảng chapter._id -> bỏ được 1 tầng
      // phụ thuộc, chạy song song được với chapters ở trên.
      Comment.aggregate([
        {
          $match: {
            manga: manga._id,
            isHidden: { $ne: true },
          },
        },
        {
          $group: {
            _id: "$chapter",
            count: { $sum: 1 },
          },
        },
      ]),

      Comment.countDocuments({
        manga: manga._id,
        isHidden: { $ne: true },
      }),

      req.isAuthenticated()
        ? ReadingHistory.find({
            user: req.user._id,
            manga: manga._id,
          }).lean()
        : Promise.resolve([]),

      Manga.aggregate([
        {
          $match: {
            _id: { $ne: manga._id },
            status: "approved",
            genres: { $in: manga.genres },
          },
        },
        {
          $addFields: {
            commonTags: {
              $size: {
                $setIntersection: ["$genres", manga.genres],
              },
            },
          },
        },
        {
          $sort: {
            commonTags: -1,
            follows: -1,
            views: -1,
            updatedAt: -1,
          },
        },
        {
          $limit: 20,
        },
      ]),
    ]);

    manga.comments = totalComments;

    if (manga.translator) {
      manga.translator.mangaCount = mangaCount;
    }

    // =========================
    // Sắp xếp danh sách chapter
    // =========================

    const getChapterValue = (value) => {
      const text = String(value).trim();

      if (text.toLowerCase() === "oneshot") {
        return Number.MAX_SAFE_INTEGER;
      }

      const num = parseFloat(text);

      if (!isNaN(num)) {
        return num;
      }

      return Number.MAX_SAFE_INTEGER - 1;
    };

    chapters.sort((a, b) => {
      return (
        getChapterValue(b.chapterNumber) - getChapterValue(a.chapterNumber)
      );
    });

    // =========================
    // Số bình luận riêng của từng chương
    // =========================

    const commentCountMap = {};
    chapterCommentCounts.forEach((item) => {
      if (item._id) {
        commentCountMap[item._id.toString()] = item.count;
      }
    });

    chapters.forEach((c) => {
      c.commentCount = commentCountMap[c._id.toString()] || 0;
    });

    // =========================
    // Tiến độ đọc của user hiện tại theo từng chương
    // =========================

    if (req.isAuthenticated()) {
      const progressMap = {};
      history.forEach((h) => {
        progressMap[String(h.chapterNumber)] = h.progress || 0;
      });

      chapters.forEach((c) => {
        const progress = progressMap[String(c.chapterNumber)] || 0;

        c.readProgress = progress;
        c.readStatus =
          progress >= 100 ? "done" : progress > 0 ? "reading" : "unread";
      });
    } else {
      chapters.forEach((c) => {
        c.readProgress = 0;
        c.readStatus = "unread";
      });
    }

    // =========================
    // Truyện tương tự (đã lấy ở khối Promise.all phía trên)
    // Lấy chapter mới nhất của toàn bộ truyện tương tự bằng 1 aggregate
    // query (chỉ chạy được sau khi đã có similarManga nên vẫn phải
    // await tuần tự ở đây).
    // =========================

    if (similarManga.length > 0) {
      const latestChapters = await Chapter.aggregate([
        { $match: { manga: { $in: similarManga.map((item) => item._id) } } },
        { $sort: { manga: 1, chapterOrder: -1, createdAt: -1 } },
        {
          $group: {
            _id: "$manga",
            chapterNumber: { $first: "$chapterNumber" },
            createdAt: { $first: "$createdAt" },
          },
        },
      ]);

      const latestMap = new Map(
        latestChapters.map((chapter) => [String(chapter._id), chapter]),
      );

      similarManga = similarManga.map((item) => {
        const latest = latestMap.get(String(item._id));
        item.lastChapter = latest?.chapterNumber || item.lastChapter || 0;
        item.lastChapterTime = latest?.createdAt || item.updatedAt;
        return item;
      });
    }

    // =========================
    // Lượt xem của manga CHỈ được tính khi người dùng đọc chapter
    // (xem hàm đọc chapter bên dưới), không tính khi chỉ vào trang
    // chi tiết truyện — để "Lượt xem" ở THỐNG KÊ khớp với tổng lượt
    // xem cộng dồn từ các chapter.
    // =========================

    // =========================
    // Kiểm tra chủ truyện
    // manga.translator đã được populate ở trên nên phải so sánh qua
    // manga.translator._id (không dùng .toString() trực tiếp trên object)
    // =========================

    const isOwner =
      req.isAuthenticated() &&
      manga.translator &&
      manga.translator._id.toString() === req.user._id.toString();

    // =========================
    // Kiểm tra follow
    // =========================

    let isFollowing = false;

    if (req.isAuthenticated() && req.user?.followedManga) {
      isFollowing = req.user.followedManga.some(
        (id) => id.toString() === manga._id.toString(),
      );
    }

    // =========================
    // Render
    // (số bình luận thực tế đã lấy ở khối Promise.all phía trên -
    // biến totalComments -> gán vào manga.comments)
    // =========================

    res.render("manga/detail", {
      title: manga.title,
      manga,
      chapters,
      similarManga,
      isFollowing,
      isOwner,
    });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
};

// =========================
// Theo dõi / Bỏ theo dõi truyện
// =========================

exports.toggleFollow = async (req, res) => {
  try {
    if (!req.isAuthenticated()) {
      return res.json({
        success: false,
        message: "Vui lòng đăng nhập",
      });
    }

    const manga = await Manga.findOne({
      slug: req.params.slug,
    });

    if (!manga) {
      return res.json({
        success: false,
      });
    }

    const mangaId = manga._id.toString();

    const index = req.user.followedManga.findIndex(
      (id) => id.toString() === mangaId,
    );

    let following = false;
    let showNotifPrompt = false;

    if (index === -1) {
      req.user.followedManga.push(manga._id);

      manga.follows = (manga.follows || 0) + 1;

      following = true;

      // Lần đầu tiên user bấm "Theo dõi" (ở bất kỳ truyện nào) thì gợi ý bật thông báo đẩy
      if (!req.user.hasSeenNotifPrompt) {
        req.user.hasSeenNotifPrompt = true;
        showNotifPrompt = true;
      }
    } else {
      req.user.followedManga.splice(index, 1);

      manga.follows = Math.max((manga.follows || 0) - 1, 0);

      following = false;
    }

    await req.user.save();
    await manga.save();

    return res.json({
      success: true,
      following,
      follows: manga.follows,
      showNotifPrompt,
    });
  } catch (err) {
    console.error(err);

    return res.json({
      success: false,
    });
  }
};

// =========================
// Đọc Chapter
// =========================

exports.readChapter = async (req, res) => {
  try {
    // .lean() vì phần tăng view bên dưới sẽ chuyển sang dùng
    // Manga.updateOne({$inc}) thay vì manga.save() (atomic hơn, và
    // không cần load full Mongoose document).
    const manga = await Manga.findOne({
      slug: req.params.slug,
      status: "approved",
    }).lean();

    if (!manga) {
      return res.redirect("/");
    }

    const chapterNumber = String(req.params.number);

    // 3 query này đều chỉ phụ thuộc vào manga._id (không phụ thuộc lẫn
    // nhau) -> chạy song song thay vì tuần tự từng cái một.
    const [chapter, allChapters, historyDoc] = await Promise.all([
      Chapter.findOne({
        manga: manga._id,
        chapterNumber,
      }).lean(),

      Chapter.find({
        manga: manga._id,
        isHidden: { $ne: true },
      })
        .sort({ chapterOrder: 1 })
        .lean(),

      req.user
        ? ReadingHistory.findOne({
            user: req.user._id,
            manga: manga._id,
            chapterNumber,
          }).lean()
        : Promise.resolve(null),
    ]);

    if (!chapter) {
      return res.redirect("/manga/" + manga.slug);
    }

    // Chương đã bị Admin ẩn do vi phạm -> chặn truy cập trực tiếp
    if (chapter.isHidden) {
      req.flash("error", "Chương này đã bị ẩn do vi phạm quy định nội dung.");
      return res.redirect("/manga/" + manga.slug);
    }

    // =========================
    // Hỗ trợ cả dữ liệu cũ và Cloudinary
    // =========================

    let pages = [];

    if (Array.isArray(chapter.pages)) {
      pages = chapter.pages
        .map((page) => {
          if (typeof page === "string") {
            return page;
          }

          if (page && typeof page === "object") {
            return page.url;
          }

          return "";
        })
        .filter(Boolean);
    }

    // =========================

    const currentIndex = allChapters.findIndex(
      (c) => c._id.toString() === chapter._id.toString(),
    );

    const prevChapter = currentIndex > 0 ? allChapters[currentIndex - 1] : null;

    const nextChapter =
      currentIndex < allChapters.length - 1
        ? allChapters[currentIndex + 1]
        : null;

    // =========================
    // Tăng view: chỉ tính cho user đã đăng nhập, mỗi tài khoản chỉ tính
    // 1 view / chương (khách chưa đăng nhập không được tính view, vì
    // không có ID cố định để chống trùng đáng tin cậy)
    // =========================

    let shouldCountView = false;

    // Chủ truyện (translator) hoặc người upload chương tự xem lại chương
    // của mình (để kiểm tra sau khi đăng) thì KHÔNG tính view.
    const isOwnerOrUploader =
      req.user &&
      (req.user._id.toString() === manga.translator?.toString() ||
        req.user._id.toString() === chapter.uploadedBy?.toString());

    if (req.user && !isOwnerOrUploader) {
      // Đã đăng nhập: dùng DB để nhớ vĩnh viễn, không phụ thuộc session
      // (tránh bị tính view lại khi session hết hạn hoặc đổi trình duyệt/thiết bị)
      try {
        await ChapterView.create({
          user: req.user._id,
          chapter: chapter._id,
          manga: manga._id,
        });

        shouldCountView = true;
      } catch (err) {
        // Trùng key (unique index) nghĩa là tài khoản này đã xem chương rồi
        if (err.code !== 11000) {
          console.log(err);
        }

        shouldCountView = false;
      }
    }

    if (shouldCountView) {
      // Dùng $inc atomic trực tiếp trên DB thay vì load cả document rồi
      // .save() lại -> nhanh hơn và tránh mất dữ liệu nếu có 2 request
      // ghi đè lên nhau cùng lúc (race condition). 2 lệnh update độc
      // lập -> chạy song song.
      // weeklyViews/monthlyViews vẫn được cộng NGAY ở đây (+1, optimistic)
      // để người dùng thấy cập nhật tức thì trên "Truyện nổi bật", KHÔNG
      // phải chờ tới chu kỳ tính lại của scheduler (tối đa 15 phút).
      // utils/viewsRollupScheduler.js vẫn chạy định kỳ để TÍNH LẠI CHÍNH
      // XÁC theo đúng cửa sổ 7 ngày/30 ngày (xử lý việc "rớt" các view
      // cũ ra khỏi cửa sổ theo thời gian mà +1 ở đây không tự làm được)
      // -> +1 ở đây chỉ để hiển thị mượt/tức thì, còn số đúng tuyệt đối
      // vẫn do scheduler chốt lại theo chu kỳ.
      let viewCountFailed = false;

      try {
        await Promise.all([
          Manga.updateOne(
            { _id: manga._id },
            { $inc: { views: 1, weeklyViews: 1, monthlyViews: 1 } },
          ),
          Chapter.updateOne({ _id: chapter._id }, { $inc: { views: 1 } }),
        ]);
      } catch (viewErr) {
        // Tự phục hồi: nếu bước cộng view bị lỗi (bất kể lý do gì), xoá
        // luôn bản ghi ChapterView vừa tạo ở trên -> lần đọc kế tiếp của
        // tài khoản này sẽ được tính lại, thay vì bị coi là "đã tính
        // rồi" mãi mãi trong khi thực tế view chưa từng được cộng.
        console.error(
          `[readChapter] Lỗi khi cộng view, đang hoàn tác ChapterView. slug=${req.params.slug} chapter=${req.params.number}`,
          viewErr,
        );

        await ChapterView.deleteOne({
          user: req.user._id,
          chapter: chapter._id,
        }).catch(() => {});

        viewCountFailed = true;
      }

      if (!viewCountFailed) {
        // manga là object lean (không tự đồng bộ với DB) -> cộng thêm ở
        // local để trang render ra vẫn thấy số view mới nhất ngay lập tức.
        manga.views = (manga.views || 0) + 1;
        manga.weeklyViews = (manga.weeklyViews || 0) + 1;
        manga.monthlyViews = (manga.monthlyViews || 0) + 1;
      }
    }

    const savedScroll = historyDoc?.scrollPosition || 0;
    const savedProgress = historyDoc?.progress || 0;

    res.render("manga/read", {
      title: `${manga.title} - Chapter ${chapter.chapterNumber}`,
      manga,
      chapter,
      pages,
      allChapters,
      prevChapter,
      nextChapter,
      savedScroll,
      savedProgress,
    });
  } catch (err) {
    // Log đầy đủ context để biết CHÍNH XÁC bộ/chương nào và
    // thiết bị/trình duyệt nào gây lỗi, thay vì chỉ log mỗi err
    // chung chung như trước (không biết lỗi xảy ra ở request nào).
    console.error(
      `[readChapter] Lỗi khi đọc chương. slug=${req.params.slug} chapter=${req.params.number} UA=${req.headers["user-agent"]}`,
      err,
    );

    // Trước đây redirect thẳng về "/" mà không có thông báo gì -> người
    // dùng thấy như site tự nhiên "văng" về trang chủ, không rõ lý do.
    // Giờ hiện flash message rõ ràng + quay lại đúng trang truyện (gần
    // với ngữ cảnh đang đọc hơn là bay hẳn về trang chủ).
    req.flash(
      "error",
      "Đã có lỗi khi tải chương này. Vui lòng thử lại, nếu vẫn lỗi hãy báo cho admin kèm tên truyện + số chương.",
    );

    return res.redirect("/manga/" + req.params.slug);
  }
};

// =========================
// Lưu lịch sử đọc
// =========================

exports.saveHistory = async (req, res) => {
  try {
    if (!req.user) {
      return res.json({ success: false });
    }

    const {
      mangaId,
      mangaTitle,
      mangaSlug,
      cover,
      chapterTitle,
      chapterNumber,
      progress,
      scrollPosition,
    } = req.body;

    const oldHistory = await ReadingHistory.findOne({
      user: req.user._id,
      manga: mangaId,
      chapterNumber,
    });

    let finalProgress = progress;
    let finalScroll = scrollPosition;

    if (oldHistory) {
      finalProgress = Math.max(oldHistory.progress || 0, progress || 0);

      if (progress < oldHistory.progress) {
        finalScroll = oldHistory.scrollPosition || 0;
      }
    }

    await ReadingHistory.findOneAndUpdate(
      {
        user: req.user._id,
        manga: mangaId,
        chapterNumber,
      },
      {
        manga: mangaId,
        mangaTitle,
        mangaSlug,
        cover,
        chapterNumber,
        chapterTitle,
        progress: finalProgress,
        scrollPosition: finalScroll,
        updatedAt: new Date(),
      },
      {
        upsert: true,
        returnDocument: "after",
      },
    );

    res.json({
      success: true,
    });
  } catch (err) {
    console.error(err);

    res.status(500).json({
      success: false,
    });
  }
};

// =========================
// Search AJAX
// =========================

exports.searchAjax = async (req, res) => {
  try {
    const keyword = req.query.q || "";

    if (!keyword.trim()) {
      return res.json([]);
    }

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const normalizedKeyword = removeVietnameseTones(keyword);

    const mangas = await Manga.find({
      titleNormalized: {
        $regex: escapeRegex(normalizedKeyword),
        $options: "i",
      },
      status: "approved",
    })
      .select("title slug cover")
      .limit(8);

    res.json(mangas);
  } catch (err) {
    console.error(err);
    res.json([]);
  }
};

// =========================
// Lịch sử đọc
// =========================

exports.history = async (req, res) => {
  try {
    if (!req.user) {
      return res.redirect("/login");
    }

    const histories = await ReadingHistory.find({
      user: req.user._id,
    })
      .sort({
        updatedAt: -1,
      })
      .lean();

    const grouped = {};

    for (const item of histories) {
      const mangaId = item.manga.toString();

      if (!grouped[mangaId]) {
        grouped[mangaId] = {
          manga: item.manga,
          mangaTitle: item.mangaTitle,
          mangaSlug: item.mangaSlug,
          cover: item.cover,
          timeAgo: timeAgo(item.updatedAt),
          chapters: [],
        };
      }

      if (grouped[mangaId].chapters.length < 3) {
        let chapterTitle = item.chapterTitle || "";

        if (!chapterTitle) {
          const found = await Chapter.findOne({
            manga: item.manga,
            chapterNumber: item.chapterNumber,
          }).lean();

          if (found && found.title && found.title !== "Không có tiêu đề") {
            chapterTitle = found.title;
          }
        }

        grouped[mangaId].chapters.push({
          chapterNumber: item.chapterNumber,
          title: chapterTitle,
          progress: item.progress || 0,
        });
      }
    }

    res.render("manga/history", {
      title: "Lịch sử đọc",
      histories: Object.values(grouped),
    });
  } catch (err) {
    console.error(err);
    res.redirect("/");
  }
};

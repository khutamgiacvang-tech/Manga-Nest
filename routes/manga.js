const express = require("express");
const router = express.Router();

const multer = require("multer");
const path = require("path");
const fs = require("fs");
const Manga = require("../models/Manga");
const mangaController = require("../controllers/mangaController");
const Chapter = require("../models/Chapter");
const removeVietnameseTones = require("../utils/removeVietnameseTones");

// =======================
// Tạo thư mục temp
// =======================

if (!fs.existsSync("temp")) {
  fs.mkdirSync("temp");
}

// =======================
// Upload cover + banner
// =======================

const storage = multer.diskStorage({
  destination(req, file, cb) {
    cb(null, "temp");
  },

  filename(req, file, cb) {
    // Thêm hậu tố ngẫu nhiên để tránh trùng tên khi 2 file (cover + banner)
    // được upload gần như cùng lúc trong cùng 1 request và Date.now()
    // trả về cùng giá trị mili-giây.
    const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
    cb(null, unique + path.extname(file.originalname));
  },
});

const upload = multer({
  storage,
});

// =======================
// Upload ZIP chapter
// =======================

const chapterUpload = multer({
  storage: multer.diskStorage({
    destination(req, file, cb) {
      cb(null, "temp");
    },

    filename(req, file, cb) {
      const unique = Date.now() + "-" + Math.round(Math.random() * 1e9);
      cb(
        null,

        unique + path.extname(file.originalname),
      );
    },
  }),
});

// =======================
// Tạo truyện
// =======================

router.get(
  "/upload",

  mangaController.showCreate,
);

router.post(
  "/upload",

  upload.fields([
    {
      name: "cover",

      maxCount: 1,
    },

    {
      name: "banner",

      maxCount: 1,
    },
  ]),

  mangaController.create,
);

// =======================
// Upload Chapter
// =======================

router.get(
  "/upload/:slug/chapter",

  mangaController.showUploadChapter,
);

router.post(
  "/upload/:slug/chapter",

  chapterUpload.single("zip"),

  mangaController.uploadChapter,
);

// =========================
// Truyện của tôi
// =========================

router.get(
  "/my-manga",

  mangaController.myManga,
);

router.get(
  "/my-manga/:slug",

  mangaController.manageManga,
);

// =========================
// Sửa thông tin truyện
// =========================

router.get(
  "/my-manga/:slug/edit",

  mangaController.showEdit,
);

router.post(
  "/my-manga/:slug/edit",

  mangaController.updateManga,
);

// =========================
// Đổi Cover
// =========================

router.get(
  "/my-manga/:slug/cover",

  mangaController.showChangeCover,
);

router.post(
  "/my-manga/:slug/cover",

  upload.single("cover"),

  mangaController.changeCover,
);

// =========================
// Đổi Banner
// =========================

router.get(
  "/my-manga/:slug/banner",

  mangaController.showChangeBanner,
);

router.post(
  "/my-manga/:slug/banner",

  upload.single("banner"),

  mangaController.changeBanner,
);

// =========================
// Xóa truyện
// =========================

router.get(
  "/my-manga/:slug/delete",

  mangaController.deleteManga,
);

// =========================
// Xóa Chapter
// =========================

router.get(
  "/my-manga/:slug/chapter/:id/delete",

  mangaController.deleteChapter,
);

// =========================
// Sửa Chapter
// =========================

router.get(
  "/my-manga/:slug/chapter/:id/edit",

  mangaController.showEditChapter,
);

router.post(
  "/my-manga/:slug/chapter/:id/edit",

  chapterUpload.single("zip"),

  mangaController.updateChapter,
);

// =========================
// Trạng thái Chapter (bị ẩn / bị xóa - xem lý do)
// =========================

router.get(
  "/my-manga/:slug/chapter/:id/status",

  mangaController.chapterStatus,
);

router.get("/manga/:slug", mangaController.showManga);

// =========================
// Theo dõi / Bỏ theo dõi truyện
// =========================

router.post("/manga/:slug/follow", mangaController.toggleFollow);

router.get("/manga/:slug/chapter/:number", mangaController.readChapter);

// =========================
// Danh sách truyện (có sort/genre/phân trang)
// =========================

router.get("/manga", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    // 24 truyện/trang: Desktop 4 cột x 6 hàng, Mobile/Tablet 3 cột x 8 hàng.
    const limit = 24;

    const filter = { status: "approved" };

    // Lọc theo genre nếu có (giữ tương thích với link ?genre=romance,comedy)
    if (req.query.genre) {
      const genreList = req.query.genre
        .split(",")
        .map((g) => g.trim())
        .filter((g) => g !== "");

      if (genreList.length > 0) {
        filter.genres = {
          $all: genreList.map((g) => new RegExp(`^${g}$`, "i")),
        };
      }
    }

    const [totalMangas, mangas] = await Promise.all([
      Manga.countDocuments(filter),
      Manga.find(filter)
        .sort({ lastUpdated: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
    ]);

    const totalPages = Math.max(Math.ceil(totalMangas / limit), 1);

    // Lấy chapter mới nhất của cả trang bằng 1 aggregate query.
    if (mangas.length > 0) {
      const latestChapters = await Chapter.aggregate([
        { $match: { manga: { $in: mangas.map((manga) => manga._id) } } },
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

      for (const manga of mangas) {
        const latest = latestMap.get(String(manga._id));
        manga.lastChapter = latest?.chapterNumber || manga.lastChapter || 0;
        manga.lastChapterDate = latest?.createdAt || manga.createdAt;
      }
    }

    // =========================
    // Xác định tiêu đề trang theo query
    // =========================

    let pageTitle = "Danh sách truyện";

    const genreParam = (req.query.genre || "").toLowerCase();

    if (req.query.sort === "new") {
      pageTitle = "Danh sách truyện mới";
    } else if (
      genreParam.includes("romance") &&
      genreParam.includes("comedy")
    ) {
      pageTitle = "Danh sách Romcom";
    } else if (
      genreParam.includes("slice-of-life") ||
      genreParam.includes("đời thường")
    ) {
      pageTitle = "Danh sách Đời thường";
    } else if (req.query.genre) {
      pageTitle = "Danh sách " + req.query.genre;
    }

    res.render("manga/list", {
      title: pageTitle,
      pageTitle,
      mangas,
      currentPage: page,
      totalPages,
      query: req.query,
    });
  } catch (err) {
    console.log(err);

    res.render("manga/list", {
      title: "Danh sách truyện",
      pageTitle: "Danh sách truyện",
      mangas: [],
      currentPage: 1,
      totalPages: 1,
      query: {},
    });
  }
});

router.get("/search", async (req, res) => {
  try {
    const page = parseInt(req.query.page) || 1;
    // 24 truyện/trang: Desktop 4 cột x 6 hàng, Mobile/Tablet 3 cột x 8 hàng.
    const limit = 24;

    // ============ Chuẩn hoá tham số ============
    const keyword = (req.query.q || "").trim();

    let selectedGenres = [];
    if (req.query.genre) {
      selectedGenres = Array.isArray(req.query.genre)
        ? req.query.genre
        : String(req.query.genre).split(",");
    }
    selectedGenres = selectedGenres.map((g) => g.trim()).filter(Boolean);

    const escapeRegex = (str) => str.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

    const filter = { status: "approved" };

    if (keyword) {
      filter.titleNormalized = {
        $regex: escapeRegex(removeVietnameseTones(keyword)),
        $options: "i",
      };
    }

    if (selectedGenres.length > 0) {
      filter.genres = {
        $all: selectedGenres.map((g) => new RegExp(`^${escapeRegex(g)}$`, "i")),
      };
    }

    const hasSearched = Boolean(keyword || selectedGenres.length);

    const [totalMangas, mangas, allGenres] = await Promise.all([
      Manga.countDocuments(filter),
      Manga.find(filter)
        .sort({ lastUpdated: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      Manga.distinct("genres", { status: "approved" }),
    ]);

    const totalPages = Math.max(Math.ceil(totalMangas / limit), 1);

    if (mangas.length > 0) {
      const latestChapters = await Chapter.aggregate([
        { $match: { manga: { $in: mangas.map((manga) => manga._id) } } },
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

      for (const manga of mangas) {
        const latest = latestMap.get(String(manga._id));
        manga.lastChapter = latest?.chapterNumber || manga.lastChapter || 0;
        manga.lastChapterDate = latest?.createdAt || manga.createdAt;
      }
    }

    // Toàn bộ thể loại đang có trên hệ thống (để hiển thị checkbox)
    allGenres.sort((a, b) => a.localeCompare(b));

    // Giữ activeTab: nếu đang lọc theo thể loại thì mở sẵn tab đó
    const activeTab = selectedGenres.length > 0 ? "genre" : "name";

    res.render("manga/search", {
      title: keyword
        ? `Tìm kiếm: ${keyword}`
        : selectedGenres.length
          ? `Thể loại: ${selectedGenres.join(", ")}`
          : "Tìm kiếm truyện",
      mangas,
      allGenres,
      keyword,
      selectedGenres,
      activeTab,
      hasSearched,
      currentPage: page,
      totalPages,
    });
  } catch (err) {
    console.log(err);

    res.render("manga/search", {
      title: "Tìm kiếm truyện",
      mangas: [],
      allGenres: [],
      keyword: "",
      selectedGenres: [],
      activeTab: "name",
      hasSearched: false,
      currentPage: 1,
      totalPages: 1,
    });
  }
});

router.get("/api/search", mangaController.searchAjax);

router.post("/history/save", mangaController.saveHistory);

router.get("/history", mangaController.history);

module.exports = router;

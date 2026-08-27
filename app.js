const express = require("express");
const dotenv = require("dotenv");

// =====================
// ENV LOAD PHẢI LÊN ĐẦU
// =====================
dotenv.config();

const connectDB = require("./config/database");
const path = require("path");
const expressLayouts = require("express-ejs-layouts");
const session = require("express-session");
const { MongoStore } = require("connect-mongo");
const cookieParser = require("cookie-parser");
const flash = require("connect-flash");

const passport = require("./config/passport");

const Notification = require("./models/Notification");
const timeAgo = require("./utils/timeAgo");
const checkBan = require("./middleware/checkBan");
const { startViewsRollupScheduler } = require("./utils/viewsRollupScheduler");

// =====================
// INIT APP
// =====================
const app = express();

// Render chạy sau reverse proxy; giữ đúng scheme HTTPS cho OAuth/URL.
app.set("trust proxy", 1);

// =====================
// GLOBAL HELPER CHO EJS
// =====================
app.locals.timeAgo = timeAgo;

// =====================
// CONNECT DATABASE
// =====================
connectDB();
startViewsRollupScheduler();

// =====================
// MIDDLEWARE BODY
// =====================
app.use(express.urlencoded({ extended: true }));
app.use(express.json());
app.use(cookieParser());

// =====================
// STATIC FILES
// =====================
// CSS/JS/ảnh không cần session/passport/checkBan. Đặt trước middleware
// động để tránh MongoDB query cho mỗi tài nguyên tĩnh.
const isDev = process.env.NODE_ENV !== "production";

app.use(
  express.static(path.join(__dirname, "public"), {
    // Dev: tắt cache để sửa CSS/JS là thấy ngay, khỏi phải hard refresh.
    // Production: giữ cache 7 ngày cho nhanh.
    maxAge: isDev ? 0 : "7d",
    etag: true,
  }),
);

// =====================
// SESSION
// =====================
app.use(
  session({
    secret: process.env.SESSION_SECRET || "manganest-secret",
    resave: false,
    saveUninitialized: false,
    store: MongoStore.create({
      mongoUrl: process.env.MONGODB_URI,
    }),
    cookie: {
      maxAge: 1000 * 60 * 60 * 24 * 7,
    },
  }),
);

// =====================
// FLASH + PASSPORT
// =====================

app.use(flash());

app.use(passport.initialize());

app.use(passport.session());

// =====================
// CHECK USER BAN
// =====================
app.use(checkBan);

// =====================
// GLOBAL VARIABLES + NOTIFICATION
// =====================

app.use(async (req, res, next) => {
  const success = req.flash("success");
  const error = req.flash("error");

  res.locals.success = success;
  res.locals.error = error;

  res.locals.success_msg = success;
  res.locals.error_msg = error;

  res.locals.user = req.user || null;

  if (req.user) {
    const notifications = await Notification.find({
      user: req.user._id,
    })
      .sort({ createdAt: -1 })
      .limit(8)
      .select("title message link image isRead createdAt")
      .lean(); // .lean() -> trả plain object, bỏ overhead tạo Mongoose document (chạy trên MỌI request nên càng cần nhẹ nhất có thể)

    res.locals.notifications = notifications;

    res.locals.unreadCount = notifications.filter((n) => !n.isRead).length;
  } else {
    res.locals.notifications = [];

    res.locals.unreadCount = 0;
  }

  next();
});
// =====================
// VIEW ENGINE
// =====================
app.set("view engine", "ejs");
app.set("views", path.join(__dirname, "views"));

app.use(expressLayouts);
app.set("layout", "layouts/main");

// =====================
// ROUTES
// =====================
app.use("/", require("./routes/home"));
app.use("/", require("./routes/auth"));
app.use("/", require("./routes/profile"));
app.use("/", require("./routes/translator"));
app.use("/", require("./routes/admin"));
app.use("/", require("./routes/manga"));
app.use("/", require("./routes/notification"));
app.use("/api", require("./routes/push"));
app.use("/", require("./routes/comment"));

// =====================
// ERROR HANDLER CHUNG (Multer, v.v.)
// =====================
app.use((err, req, res, next) => {
  if (!err) return next();

  // Log kèm URL gốc + user-agent để biết chính xác request nào, thiết
  // bị/trình duyệt nào gây lỗi (trước đây chỉ log err.message, không
  // biết lỗi xảy ra ở đâu -> không debug được các bug "chập chờn").
  console.error(
    `Lỗi middleware/upload tại ${req.method} ${req.originalUrl} | UA: ${req.headers["user-agent"]}`,
    err,
  );

  if (req.flash) {
    req.flash("error", err.message || "Có lỗi xảy ra, vui lòng thử lại.");
  }

  const backTo = req.get("Referer") || "/";
  return res.redirect(backTo);
});

// =====================
// SERVER
// =====================
const PORT = process.env.PORT || 3000;

app.listen(PORT, "0.0.0.0", () => {
  console.log(`🚀 Server chạy tại http://localhost:${PORT}`);
});

// =====================
// TEST PUSH ROUTE
// =====================
app.post("/api/test-push", async (req, res) => {
  try {
    if (!req.user) {
      return res.status(401).json({ message: "Chưa đăng nhập!" });
    }

    // Tìm subscription đã lưu của user (giả sử model User hoặc PushSubscription của bạn có lưu trữ)
    const subscription = req.user.pushSubscription;

    if (!subscription || !subscription.endpoint) {
      return res.status(400).json({
        message:
          "Không tìm thấy thông tin đăng ký nhận thông báo (subscription) của tài khoản này!",
      });
    }

    const webpush = require("web-push");

    // Dùng favicon.png làm cover cho thông báo test, giống cách thông báo
    // chương mới dùng cover truyện (icon/image phải là URL tuyệt đối để
    // trình duyệt hiển thị được trong Notification API).
    const baseUrl = `${req.protocol}://${req.get("host")}`;
    const faviconUrl = `${baseUrl}/images/icon/favicon.png`;

    const payload = JSON.stringify({
      title: "MangaNest Test",
      body: "Thông báo đẩy từ server hoạt động thành công rồi nhé! 🎉",
      icon: faviconUrl,
      // Không gửi field "image" cho thông báo thử -> tránh hiện banner to,
      // các thông báo thật (chương mới...) vẫn dùng field "image" bình thường.
      url: "/profile",
    });

    await webpush.sendNotification(subscription, payload);
    res.status(200).json({ message: "Gửi thông báo thành công!" });
  } catch (error) {
    console.error("Lỗi khi gửi push notification:", error);
    res
      .status(500)
      .json({ message: "Lỗi server khi gửi thông báo: " + error.message });
  }
});

const Manga = require("../models/Manga");
const AppState = require("../models/AppState");

// Reset weeklyViews vào đầu mỗi tuần (thứ 2) và monthlyViews vào đầu mỗi
// tháng (ngày 1). Trước đây weeklyViews/monthlyViews chỉ được CỘNG dồn mỗi
// khi có lượt đọc mới (xem mangaController.js), nhưng chưa từng có ai reset
// chúng về 0 -> weeklyViews/monthlyViews luôn bằng views (tăng cùng lúc,
// cùng tốc độ) -> xếp hạng theo TUẦN/THÁNG/MỌI LÚC luôn ra kết quả giống
// hệt nhau. Đây là nơi sửa gốc vấn đề đó.

const CHECK_INTERVAL_MS = 30 * 60 * 1000; // kiểm tra mỗi 30 phút là đủ

function getWeekKey(date) {
  // Khoá đại diện cho "tuần" hiện tại: dùng số tuần trong năm (thứ 2 là
  // đầu tuần) kết hợp với năm để tránh đụng giữa các năm khác nhau.
  const d = new Date(
    Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()),
  );

  // ISO: thứ 2 = 1 ... chủ nhật = 7
  const dayNum = d.getUTCDay() || 7;
  d.setUTCDate(d.getUTCDate() + 4 - dayNum);

  const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));

  const weekNo = Math.ceil(((d - yearStart) / 86400000 + 1) / 7);

  return `${d.getUTCFullYear()}-W${weekNo}`;
}

function getMonthKey(date) {
  return `${date.getFullYear()}-${date.getMonth()}`;
}

async function getOrCreateState() {
  let state = await AppState.findOne({ key: "global" });

  if (!state) {
    state = await AppState.create({
      key: "global",

      // Lần đầu chạy: coi như "vừa reset xong" tại thời điểm hiện tại, để
      // tránh việc mới deploy tính năng này lên đã xoá sạch view đang có.
      lastWeeklyViewsReset: new Date(),
      lastMonthlyViewsReset: new Date(),
    });
  }

  return state;
}

async function checkAndResetViews() {
  try {
    const now = new Date();
    const state = await getOrCreateState();

    const needWeeklyReset =
      !state.lastWeeklyViewsReset ||
      getWeekKey(state.lastWeeklyViewsReset) !== getWeekKey(now);

    const needMonthlyReset =
      !state.lastMonthlyViewsReset ||
      getMonthKey(state.lastMonthlyViewsReset) !== getMonthKey(now);

    if (needWeeklyReset) {
      await Manga.updateMany({}, { $set: { weeklyViews: 0 } });

      state.lastWeeklyViewsReset = now;

      console.log("[viewsResetScheduler] Đã reset weeklyViews.");
    }

    if (needMonthlyReset) {
      await Manga.updateMany({}, { $set: { monthlyViews: 0 } });

      state.lastMonthlyViewsReset = now;

      console.log("[viewsResetScheduler] Đã reset monthlyViews.");
    }

    if (needWeeklyReset || needMonthlyReset) {
      await state.save();
    }
  } catch (err) {
    console.log("[viewsResetScheduler] Lỗi khi reset views:", err);
  }
}

function startViewsResetScheduler() {
  // Chạy ngay lúc khởi động server để không phải chờ 30 phút đầu tiên.
  checkAndResetViews();

  setInterval(checkAndResetViews, CHECK_INTERVAL_MS);
}

module.exports = { startViewsResetScheduler };

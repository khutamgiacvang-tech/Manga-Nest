const Manga = require("../models/Manga");
const AppState = require("../models/AppState");

// Đầu mỗi tuần (thứ 2) và đầu mỗi tháng (ngày 1), KHÔNG set weeklyViews/
// monthlyViews về 0 nữa (làm vậy sẽ xoá luôn cả views tổng nếu chẳng may
// đụng nhầm field, và khiến toàn bộ manga rớt về 0 cùng lúc -> BXH tuần/
// tháng ngay sau reset bị xáo trộn lung tung vì tất cả hoà nhau ở mức 0).
//
// Thay vào đó: mỗi manga có views (tổng, KHÔNG BAO GIỜ bị đụng tới) và
// weeklyViewsBaseline/monthlyViewsBaseline (giá trị của views tại thời
// điểm bắt đầu tuần/tháng hiện tại). weeklyViews/monthlyViews luôn được
// TÍNH LẠI = views - baseline (xem mangaController.js). Việc "reset" ở
// đây thực chất chỉ là chốt lại baseline = views hiện tại của từng manga,
// dữ liệu views gốc không hề mất đi.

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
      // Pipeline update: baseline mới = views hiện tại của CHÍNH manga đó
      // (mỗi document tự tham chiếu "$views" của nó), nên weeklyViews sau
      // đó = views - baseline = 0, y hệt kết quả cũ, nhưng views tổng vẫn
      // nguyên vẹn và có thể tính lại bất cứ lúc nào nếu cần.
      await Manga.updateMany({}, [
        { $set: { weeklyViewsBaseline: "$views", weeklyViews: 0 } },
      ]);

      state.lastWeeklyViewsReset = now;

      console.log(
        "[viewsResetScheduler] Đã chốt mốc tuần mới (weeklyViewsBaseline).",
      );
    }

    if (needMonthlyReset) {
      await Manga.updateMany({}, [
        { $set: { monthlyViewsBaseline: "$views", monthlyViews: 0 } },
      ]);

      state.lastMonthlyViewsReset = now;

      console.log(
        "[viewsResetScheduler] Đã chốt mốc tháng mới (monthlyViewsBaseline).",
      );
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

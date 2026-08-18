const Manga = require("../models/Manga");
const ChapterView = require("../models/ChapterView");

// =========================
// Tính weeklyViews/monthlyViews kiểu "cửa sổ trượt" (rolling window):
// đếm số ChapterView có createdAt nằm trong 7 ngày / 30 ngày GẦN NHẤT
// tính từ thời điểm chạy, group theo manga, rồi ghi lại vào Manga.
//
// Vì sao chọn cách này thay vì "reset về 0 mỗi đầu tuần/đầu tháng"
// (cách cũ): cách cũ khiến số hiển thị nhảy cục về 0 ngay lúc reset dù
// tuần/tháng trước vẫn có nhiều view. Cách này không có khái niệm
// "reset" ở 1 mốc cố định nào cả -> số liệu luôn là "view thật trong N
// ngày gần nhất", tự nhiên trôi mượt theo thời gian, không bao giờ bị
// nhảy cục.
//
// Chạy định kỳ (không cần chạy mỗi lần có view mới, vì BXH tuần/tháng
// không cần chính xác tới từng giây) -> đủ để không tốn tài nguyên mà
// vẫn gần như real-time.
// =========================

const ROLLUP_INTERVAL_MS = 15 * 60 * 1000; // 15 phút / lần

const WEEK_MS = 7 * 24 * 60 * 60 * 1000;
const MONTH_MS = 30 * 24 * 60 * 60 * 1000;

async function rollupViews() {
  try {
    const now = new Date();

    const weekAgo = new Date(now.getTime() - WEEK_MS);
    const monthAgo = new Date(now.getTime() - MONTH_MS);

    // 2 aggregate này độc lập nhau -> chạy song song.
    const [weeklyAgg, monthlyAgg, allMangaIds] = await Promise.all([
      ChapterView.aggregate([
        { $match: { createdAt: { $gte: weekAgo } } },
        { $group: { _id: "$manga", count: { $sum: 1 } } },
      ]),

      ChapterView.aggregate([
        { $match: { createdAt: { $gte: monthAgo } } },
        { $group: { _id: "$manga", count: { $sum: 1 } } },
      ]),

      // Lấy toàn bộ manga để chắc chắn manga nào KHÔNG còn nằm trong
      // kết quả aggregate ở trên (vì hết view trong khoảng thời gian
      // đó) cũng được set lại về đúng 0, không bị giữ số cũ mãi mãi.
      Manga.find({}).select("_id").lean(),
    ]);

    const weeklyMap = new Map(
      weeklyAgg.map((entry) => [String(entry._id), entry.count]),
    );

    const monthlyMap = new Map(
      monthlyAgg.map((entry) => [String(entry._id), entry.count]),
    );

    if (allMangaIds.length === 0) return;

    // Set thẳng giá trị cuối cùng (đúng hoặc 0) cho từng manga trong 1
    // lượt bulkWrite duy nhất -> không có khoảng thời gian nào mà số
    // liệu bị "về 0 tạm thời" giữa 2 bước như nếu tách riêng update
    // reset rồi update lại.
    const ops = allMangaIds.map((m) => {
      const id = String(m._id);

      return {
        updateOne: {
          filter: { _id: m._id },
          update: {
            $set: {
              weeklyViews: weeklyMap.get(id) || 0,
              monthlyViews: monthlyMap.get(id) || 0,
            },
          },
        },
      };
    });

    await Manga.bulkWrite(ops, { ordered: false });

    console.log(
      `[viewsRollupScheduler] Đã tính lại weeklyViews/monthlyViews cho ${ops.length} truyện.`,
    );
  } catch (err) {
    console.error("[viewsRollupScheduler] Lỗi khi tính lại views:", err);
  }
}

function startViewsRollupScheduler() {
  // Chạy ngay lúc khởi động để không phải chờ tới chu kỳ đầu tiên.
  rollupViews();

  setInterval(rollupViews, ROLLUP_INTERVAL_MS);
}

module.exports = { startViewsRollupScheduler };

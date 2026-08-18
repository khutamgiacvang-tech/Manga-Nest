const Manga = require("../models/Manga");
const ChapterView = require("../models/ChapterView");

// =========================
// Tính LẠI (đối chiếu, sửa lệch) weeklyViews/monthlyViews kiểu "cửa sổ
// trượt" (rolling window): đếm số ChapterView có createdAt nằm trong 7
// ngày / 30 ngày GẦN NHẤT tính từ thời điểm chạy, group theo manga,
// rồi ghi lại vào Manga.
//
// weeklyViews/monthlyViews ĐÃ được +1 ngay lập tức mỗi khi có view mới
// (xem mangaController.js -> readChapter) để hiển thị mượt/tức thì.
// Nhưng chỉ +1 thôi thì KHÔNG tự "rớt" được các view cũ ra khỏi cửa sổ
// 7 ngày/30 ngày khi thời gian trôi qua (ví dụ 1 view của 8 ngày trước
// cần tự động không còn được tính vào "TUẦN" nữa). Scheduler này chạy
// định kỳ để tính lại CHÍNH XÁC theo đúng cửa sổ thời gian, sửa lại
// đúng số cho toàn bộ manga -> kết hợp cả 2: tăng tức thì lúc có view
// mới + tự sửa lệch/decay định kỳ theo thời gian.
//
// Chạy định kỳ (không cần chạy mỗi lần có view mới) -> đủ để không tốn
// tài nguyên mà vẫn gần như real-time.
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

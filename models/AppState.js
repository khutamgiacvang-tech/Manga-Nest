const mongoose = require("mongoose");

// Document đơn (singleton) dùng để lưu các mốc thời gian dùng chung cho
// toàn hệ thống, ví dụ: lần cuối cùng reset weeklyViews/monthlyViews của
// Manga. Truy vấn luôn bằng key cố định "global".
const appStateSchema = new mongoose.Schema({
  key: {
    type: String,
    required: true,
    unique: true,
    default: "global",
  },

  lastWeeklyViewsReset: {
    type: Date,
    default: null,
  },

  lastMonthlyViewsReset: {
    type: Date,
    default: null,
  },
});

module.exports = mongoose.model("AppState", appStateSchema);

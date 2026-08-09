const mongoose = require("mongoose");
const seedDefaultCategories = require("../utils/seedCategories");

const connectDB = async () => {
  try {
    console.log("Đang kết nối MongoDB...");

    await mongoose.connect(process.env.MONGODB_URI, {
      serverSelectionTimeoutMS: 5000,
    });

    console.log("✅ MongoDB Atlas Connected");

    // Seed danh sách thể loại mặc định (chỉ chạy nếu collection đang trống)
    await seedDefaultCategories();
  } catch (err) {
    console.log("❌ Mongo Error");

    console.log(err);
  }
};

module.exports = connectDB;

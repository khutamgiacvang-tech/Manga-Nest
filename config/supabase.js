const { S3Client } = require("@aws-sdk/client-s3");

// =========================
// Supabase Storage (S3-compatible)
// =========================
// Dùng làm storage provider duy nhất trong storageManager.js cho avatar /
// cover / banner truyện (thay thế iDrive e2 + CloudStorage.io, KHÔNG áp
// dụng cho ảnh trang chapter — chapter vẫn upload qua utils/uploadChapter.js
// -> Cloudinary như cũ, ảnh cũ trên Cloudinary vẫn đọc bình thường).
//
// Cách lấy thông tin:
//   1. Vào Supabase Dashboard > Project của bạn > Storage > Buckets,
//      tạo 1 bucket (ví dụ "manganest") và để chế độ Public (để ảnh có thể
//      đọc trực tiếp qua URL công khai, giống Cloudinary secure_url).
//   2. Vào Storage > Settings (hoặc "Connect" > S3) để lấy S3 Access Key ID
//      và Secret Access Key (bấm "New access key" nếu chưa có), và Region
//      của project.
//
// ENV cần có:
//   SUPABASE_URL              (vd: https://xxxxxxxxxxxx.supabase.co)
//   SUPABASE_S3_ACCESS_KEY
//   SUPABASE_S3_SECRET_KEY
//   SUPABASE_BUCKET
//   SUPABASE_S3_REGION        (tùy chọn — mặc định "us-east-1", nên set
//                              đúng region project của bạn, vd "ap-southeast-1")
//   SUPABASE_PUBLIC_URL       (tùy chọn — nếu để trống sẽ tự ghép
//                              "<SUPABASE_URL>/storage/v1/object/public/<bucket>")

const SUPABASE_URL = (process.env.SUPABASE_URL || "").replace(/\/+$/, "");
const bucket = process.env.SUPABASE_BUCKET;

// Endpoint S3-compatible riêng của Supabase Storage (khác với URL public
// dùng để đọc ảnh).
const endpoint = SUPABASE_URL ? `${SUPABASE_URL}/storage/v1/s3` : undefined;

const publicBaseUrl = (
  process.env.SUPABASE_PUBLIC_URL ||
  (SUPABASE_URL && bucket
    ? `${SUPABASE_URL}/storage/v1/object/public/${bucket}`
    : "")
).replace(/\/+$/, "");

const client = new S3Client({
  endpoint,
  region: process.env.SUPABASE_S3_REGION || "us-east-1",

  credentials: {
    accessKeyId: process.env.SUPABASE_S3_ACCESS_KEY,
    secretAccessKey: process.env.SUPABASE_S3_SECRET_KEY,
  },

  // Supabase Storage (giống hầu hết S3-compatible khác) cần path-style
  // ("<endpoint>/<bucket>/<key>") thay vì virtual-hosted-style.
  forcePathStyle: true,
});

// SUPABASE_LIMIT_BYTES (tùy chọn) — ngưỡng dung lượng riêng cho Supabase.
// Provider này giờ chỉ đóng vai trò DỰ PHÒNG (fallback) khi Cloudinary
// chưa cấu hình hoặc đã đầy, nên mặc định để thấp hơn (1GB, gói free
// Supabase) — xem thứ tự ưu tiên trong utils/storageManager.js (PROVIDERS).
const limitBytes =
  Number(process.env.SUPABASE_LIMIT_BYTES) || 1 * 1024 * 1024 * 1024;

module.exports = {
  key: "supabase",
  label: "Supabase Storage",
  type: "s3",
  client,
  bucket,
  publicBaseUrl,
  limitBytes,
  configured: Boolean(
    SUPABASE_URL &&
      bucket &&
      process.env.SUPABASE_S3_ACCESS_KEY &&
      process.env.SUPABASE_S3_SECRET_KEY,
  ),
};

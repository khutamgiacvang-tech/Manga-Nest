const { S3Client } = require("@aws-sdk/client-s3");

// =========================
// iDrive e2 (S3-compatible)
// =========================
// Lấy endpoint + access key/secret trong iDrive e2 dashboard > bucket của bạn.
// Endpoint có dạng: https://xxxxxxxx.idrivee2-xx.com (không kèm tên bucket).
//
// ENV cần có:
//   IDRIVE_E2_ENDPOINT
//   IDRIVE_E2_ACCESS_KEY
//   IDRIVE_E2_SECRET_KEY
//   IDRIVE_E2_BUCKET
//   IDRIVE_E2_PUBLIC_URL (tùy chọn — nếu để trống sẽ tự ghép
//                          "<endpoint>/<bucket>", đúng với path-style URL
//                          mặc định của iDrive e2 khi bucket đã bật public access)

const endpoint = process.env.IDRIVE_E2_ENDPOINT;
const bucket = process.env.IDRIVE_E2_BUCKET;

const publicBaseUrl = (
  process.env.IDRIVE_E2_PUBLIC_URL || `${endpoint}/${bucket}`
).replace(/\/+$/, "");

const client = new S3Client({
  endpoint,
  region: process.env.IDRIVE_E2_REGION || "us-east-1",

  credentials: {
    accessKeyId: process.env.IDRIVE_E2_ACCESS_KEY,
    secretAccessKey: process.env.IDRIVE_E2_SECRET_KEY,
  },

  // iDrive e2 (giống hầu hết S3-compatible khác) cần path-style
  // ("<endpoint>/<bucket>/<key>") thay vì virtual-hosted-style.
  forcePathStyle: true,
});

module.exports = {
  key: "idrive_e2",
  label: "iDrive e2",
  client,
  bucket,
  publicBaseUrl,
  configured: Boolean(endpoint && bucket),
};

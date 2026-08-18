const { S3Client } = require("@aws-sdk/client-s3");

// =========================
// CloudStorage.io (S3-compatible)
// =========================

const endpoint = (process.env.CLOUDSTORAGE_ENDPOINT || "").trim();
const bucket = (process.env.CLOUDSTORAGE_BUCKET || "").trim();
const region = (process.env.CLOUDSTORAGE_REGION || "eu-central-1").trim();

const accessKeyId = (process.env.CLOUDSTORAGE_ACCESS_KEY || "").trim();

const secretAccessKey = (process.env.CLOUDSTORAGE_SECRET_KEY || "").trim();

// URL public của CloudStorage.
// Nếu bạn đã có CLOUDSTORAGE_PUBLIC_URL trong Render thì dùng nó.
// Nếu chưa có thì mặc định dùng endpoint/bucket.
const publicBaseUrl = (
  process.env.CLOUDSTORAGE_PUBLIC_URL ||
  (endpoint && bucket ? `${endpoint}/${bucket}` : "")
).replace(/\/+$/, "");

const client = new S3Client({
  endpoint,
  region,

  credentials: {
    accessKeyId,
    secretAccessKey,
  },

  // CloudStorage.io hỗ trợ S3-compatible API.
  forcePathStyle: true,

  // Giữ TLS/SSL được kiểm tra bình thường.
  // KHÔNG dùng rejectUnauthorized: false.
});

module.exports = {
  key: "cloudstorage_io",
  label: "CloudStorage.io",
  type: "s3",

  client,
  bucket,
  publicBaseUrl,

  configured: Boolean(endpoint && bucket && accessKeyId && secretAccessKey),
};

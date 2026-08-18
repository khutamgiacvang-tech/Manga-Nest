const { S3Client } = require("@aws-sdk/client-s3");

// =========================
// CloudStorage.io (S3-compatible)
// =========================
// CloudStorage.io hỗ trợ API S3-compatible (boto3/AWS SDK, chỉ cần đổi
// endpoint). Lấy endpoint + access key/secret trong dashboard CloudStorage.io
// của bạn (mục API Keys / S3 Credentials).
//
// ENV cần có:
//   CLOUDSTORAGE_ENDPOINT
//   CLOUDSTORAGE_ACCESS_KEY
//   CLOUDSTORAGE_SECRET_KEY
//   CLOUDSTORAGE_BUCKET
//   CLOUDSTORAGE_PUBLIC_URL (tùy chọn — nếu để trống sẽ tự ghép
//                            "<endpoint>/<bucket>")

const endpoint = process.env.CLOUDSTORAGE_ENDPOINT;
const bucket = process.env.CLOUDSTORAGE_BUCKET;

const publicBaseUrl = (
  process.env.CLOUDSTORAGE_PUBLIC_URL || `${endpoint}/${bucket}`
).replace(/\/+$/, "");

const client = new S3Client({
  endpoint,
  region: process.env.CLOUDSTORAGE_REGION || "us-east-1",

  credentials: {
    accessKeyId: process.env.CLOUDSTORAGE_ACCESS_KEY,
    secretAccessKey: process.env.CLOUDSTORAGE_SECRET_KEY,
  },

  forcePathStyle: true,
});

module.exports = {
  key: "cloudstorage_io",
  label: "CloudStorage.io",
  client,
  bucket,
  publicBaseUrl,
  configured: Boolean(endpoint && bucket),
};

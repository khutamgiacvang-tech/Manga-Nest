const fs = require("fs");
const path = require("path");

const {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const idrive = require("../config/idrive");
const cloudstorage = require("../config/cloudstorage");
const StorageUsage = require("../models/StorageUsage");

// =========================
// Cover / Banner / Avatar / Sample-images (đơn dịch giả) storage manager
// =========================
// Thay thế Cloudinary cho các loại ảnh này (KHÔNG áp dụng cho ảnh trang
// chapter — chapter vẫn upload qua utils/uploadChapter.js -> Cloudinary
// như cũ, ảnh chapter cũ trên Cloudinary vẫn đọc bình thường).
//
// Cơ chế chuyển storage: mỗi provider có giới hạn STORAGE_LIMIT_BYTES
// (mặc định 9GB). Mỗi lần upload thành công sẽ cộng dồn size vào
// StorageUsage (Mongo). Khi provider đang active đã dùng >= giới hạn,
// lần upload tiếp theo tự động chuyển sang provider còn lại.
//
// Thứ tự ưu tiên: iDrive e2 trước, hết chỗ mới qua CloudStorage.io.

const PROVIDERS = [idrive, cloudstorage];

const STORAGE_LIMIT_BYTES =
  Number(process.env.STORAGE_LIMIT_BYTES) || 9 * 1024 * 1024 * 1024; // 9GB

const MIME_BY_EXT = {
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".png": "image/png",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".jfif": "image/jpeg",
  ".avif": "image/avif",
};

function guessMime(ext) {
  return MIME_BY_EXT[String(ext).toLowerCase()] || "application/octet-stream";
}

function uniqueFileName(ext) {
  return `${Date.now()}-${Math.round(Math.random() * 1e9)}${ext}`;
}

function getProvider(providerKey) {
  const provider = PROVIDERS.find((p) => p.key === providerKey);

  if (!provider) {
    throw new Error(`Không tìm thấy storage provider: ${providerKey}`);
  }

  return provider;
}

// =========================
// Chọn provider đang active (còn dưới ngưỡng giới hạn)
// =========================

async function getActiveProvider() {
  const configuredProviders = PROVIDERS.filter((p) => p.configured);

  if (configuredProviders.length === 0) {
    throw new Error(
      "Chưa cấu hình storage provider nào (iDrive e2 / CloudStorage.io). Kiểm tra lại biến môi trường.",
    );
  }

  for (const provider of configuredProviders) {
    const usage = await StorageUsage.findOne({ provider: provider.key });
    const bytesUsed = usage ? usage.bytesUsed : 0;

    if (bytesUsed < STORAGE_LIMIT_BYTES) {
      return provider;
    }
  }

  // Cả 2 provider đều đã đầy -> vẫn cố upload vào provider cuối cùng
  // (best-effort), đồng thời cảnh báo ra log để chủ động nâng cấp dung lượng.
  console.warn(
    "[storageManager] Tất cả storage provider đã đạt giới hạn " +
      `${(STORAGE_LIMIT_BYTES / (1024 * 1024 * 1024)).toFixed(1)}GB. ` +
      "Đang upload tạm vào provider cuối cùng, cân nhắc nâng cấp dung lượng.",
  );

  return configuredProviders[configuredProviders.length - 1];
}

async function addUsage(providerKey, bytes) {
  if (!bytes) return;

  await StorageUsage.findOneAndUpdate(
    { provider: providerKey },
    { $inc: { bytesUsed: bytes }, $set: { updatedAt: new Date() } },
    { upsert: true },
  );
}

async function subUsage(providerKey, bytes) {
  if (!bytes) return;

  const usage = await StorageUsage.findOne({ provider: providerKey });
  const newValue = Math.max(0, (usage ? usage.bytesUsed : 0) - bytes);

  await StorageUsage.findOneAndUpdate(
    { provider: providerKey },
    { $set: { bytesUsed: newValue, updatedAt: new Date() } },
    { upsert: true },
  );
}

// =========================
// Upload
// =========================

async function uploadToActiveProvider(buffer, folder, ext) {
  const provider = await getActiveProvider();
  const key = `${folder}/${uniqueFileName(ext)}`;
  const contentType = guessMime(ext);

  try {
    await provider.client.send(
      new PutObjectCommand({
        Bucket: provider.bucket,
        Key: key,
        Body: buffer,
        ContentType: contentType,
        ACL: "public-read",
      }),
    );
  } catch (err) {
    // Một số provider S3-compatible không hỗ trợ header ACL trên PutObject
    // (bucket phải để public sẵn từ dashboard). Thử lại không kèm ACL.
    const message = String(err && err.message).toLowerCase();

    if (message.includes("acl")) {
      await provider.client.send(
        new PutObjectCommand({
          Bucket: provider.bucket,
          Key: key,
          Body: buffer,
          ContentType: contentType,
        }),
      );
    } else {
      throw err;
    }
  }

  await addUsage(provider.key, buffer.length);

  const url = `${provider.publicBaseUrl}/${key}`;

  return {
    url,
    // public_id dạng "<provider>:<key>" để nhận biết đây là ảnh thuộc
    // storage mới (khác hẳn public_id kiểu Cloudinary không có dấu ":"),
    // dùng để xóa đúng provider sau này.
    public_id: `${provider.key}:${key}`,
    provider: provider.key,
    key,
  };
}

// Upload từ file path trên đĩa (giữ nguyên chữ ký giống cloudinaryUpload cũ
// để các chỗ gọi trong controllers không phải đổi nhiều).
async function uploadImage(filePath, folder) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  return uploadToActiveProvider(buffer, folder, ext);
}

// Upload thẳng từ buffer trong RAM (multer.memoryStorage)
async function uploadBuffer(buffer, folder, originalName) {
  const ext = originalName
    ? path.extname(originalName).toLowerCase()
    : ".jpg";

  return uploadToActiveProvider(buffer, folder, ext || ".jpg");
}

// =========================
// Xóa
// =========================

// Nhận vào public_id dạng "<provider>:<key>" (do uploadImage/uploadBuffer ở
// trên trả về). Trả về true nếu đã xóa, false nếu publicId không thuộc
// storage mới (ví dụ vẫn là public_id kiểu Cloudinary cũ) -> để caller tự
// fallback qua cloudinary.uploader.destroy như cũ.
function isManagedPublicId(publicId) {
  return (
    typeof publicId === "string" &&
    PROVIDERS.some((p) => publicId.startsWith(`${p.key}:`))
  );
}

async function deleteByPublicId(publicId) {
  if (!isManagedPublicId(publicId)) {
    return false;
  }

  const [providerKey, ...rest] = publicId.split(":");
  const key = rest.join(":");
  const provider = getProvider(providerKey);

  let size = 0;

  try {
    const head = await provider.client.send(
      new HeadObjectCommand({ Bucket: provider.bucket, Key: key }),
    );

    size = head.ContentLength || 0;
  } catch (err) {
    // Không lấy được size (có thể file đã bị xóa trước đó) -> vẫn tiếp tục
    // xóa, chỉ là không trừ được usage chính xác.
    console.log("[storageManager] Không lấy được size để trừ usage:", err.message);
  }

  await provider.client.send(
    new DeleteObjectCommand({ Bucket: provider.bucket, Key: key }),
  );

  await subUsage(providerKey, size);

  return true;
}

// Xóa dựa theo URL công khai (dùng cho các chỗ chỉ lưu URL, không lưu
// riêng public_id, ví dụ avatar). Trả về true nếu đã xóa.
async function deleteByUrl(url) {
  if (!url) return false;

  const provider = PROVIDERS.find(
    (p) => p.configured && url.startsWith(`${p.publicBaseUrl}/`),
  );

  if (!provider) return false;

  const key = url.slice(provider.publicBaseUrl.length + 1).split("?")[0];

  return deleteByPublicId(`${provider.key}:${key}`);
}

module.exports = uploadImage;
module.exports.uploadImage = uploadImage;
module.exports.uploadBuffer = uploadBuffer;
module.exports.deleteByPublicId = deleteByPublicId;
module.exports.deleteByUrl = deleteByUrl;
module.exports.isManagedPublicId = isManagedPublicId;
module.exports.STORAGE_LIMIT_BYTES = STORAGE_LIMIT_BYTES;
module.exports.PROVIDERS = PROVIDERS;

const fs = require("fs");
const path = require("path");

const {
  PutObjectCommand,
  DeleteObjectCommand,
  HeadObjectCommand,
} = require("@aws-sdk/client-s3");

const cloudstorage = require("../config/cloudstorage");
const cloudinaryProvider = require("../config/cloudinaryStorage");
const StorageUsage = require("../models/StorageUsage");

// =========================
// Cover / Banner / Avatar / Sample-images (đơn dịch giả) storage manager
// =========================
// Ảnh chapter vẫn upload qua utils/cloudinaryUpload.js -> Cloudinary như cũ,
// KHÔNG liên quan tới file này.
//
// Cơ chế chuyển storage: mỗi provider có giới hạn STORAGE_LIMIT_BYTES
// (mặc định 9GB). Mỗi lần upload thành công sẽ cộng dồn size vào
// StorageUsage (Mongo). Khi provider đang active đã dùng >= giới hạn,
// lần upload tiếp theo tự động chuyển sang provider còn lại.
//
// Thứ tự ưu tiên: CloudStorage.io trước, hết chỗ mới qua Cloudinary.
// (Đã bỏ iDrive e2, không upload lên iDrive nữa.)

const PROVIDERS = [cloudstorage, cloudinaryProvider];

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
      "Chưa cấu hình storage provider nào (CloudStorage.io / Cloudinary). Kiểm tra lại biến môi trường.",
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
// Upload — S3-compatible (CloudStorage.io)
// =========================

async function uploadToS3Provider(provider, buffer, folder, ext) {
  const key = `${folder}/${uniqueFileName(ext)}`;
  const contentType = guessMime(ext);

  await provider.client.send(
    new PutObjectCommand({
      Bucket: provider.bucket,
      Key: key,
      Body: buffer,
      ContentType: contentType,
    }),
  );

  return {
    url: `${provider.publicBaseUrl}/${key}`,
    key,
    bytes: buffer.length,
  };
}

// =========================
// Upload — Cloudinary
// =========================

async function uploadToCloudinaryProvider(provider, buffer, folder) {
  const dataUri = `data:image/octet-stream;base64,${buffer.toString("base64")}`;

  const result = await provider.client.uploader.upload(dataUri, {
    folder,
    resource_type: "image",
  });

  return {
    url: result.secure_url,
    key: result.public_id,
    bytes: result.bytes || buffer.length,
  };
}

// =========================
// Upload (chung, tự route theo type của provider)
// =========================

async function uploadToActiveProvider(buffer, folder, ext) {
  const provider = await getActiveProvider();

  const { url, key, bytes } =
    provider.type === "cloudinary"
      ? await uploadToCloudinaryProvider(provider, buffer, folder)
      : await uploadToS3Provider(provider, buffer, folder, ext);

  await addUsage(provider.key, bytes);

  return {
    url,
    // public_id dạng "<provider>:<key>" để nhận biết đây là ảnh thuộc
    // storage được quản lý (S3-compatible hoặc Cloudinary qua storageManager),
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
  const ext = originalName ? path.extname(originalName).toLowerCase() : ".jpg";

  return uploadToActiveProvider(buffer, folder, ext || ".jpg");
}

// =========================
// Xóa
// =========================

// Nhận vào public_id dạng "<provider>:<key>" (do uploadImage/uploadBuffer ở
// trên trả về). Trả về true nếu đã xóa, false nếu publicId không thuộc
// storage được quản lý (ví dụ vẫn là public_id kiểu Cloudinary cũ, upload
// trực tiếp qua cloudinary.uploader chứ không qua storageManager) -> để
// caller tự fallback qua cloudinary.uploader.destroy như cũ.
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

  if (provider.type === "cloudinary") {
    try {
      const resource = await provider.client.api.resource(key, {
        resource_type: "image",
      });

      size = resource.bytes || 0;
    } catch (err) {
      console.log(
        "[storageManager] Không lấy được size (Cloudinary) để trừ usage:",
        err.message,
      );
    }

    await provider.client.uploader.destroy(key, { resource_type: "image" });
  } else {
    try {
      const head = await provider.client.send(
        new HeadObjectCommand({ Bucket: provider.bucket, Key: key }),
      );

      size = head.ContentLength || 0;
    } catch (err) {
      // Không lấy được size (có thể file đã bị xóa trước đó) -> vẫn tiếp tục
      // xóa, chỉ là không trừ được usage chính xác.
      console.log(
        "[storageManager] Không lấy được size để trừ usage:",
        err.message,
      );
    }

    await provider.client.send(
      new DeleteObjectCommand({ Bucket: provider.bucket, Key: key }),
    );
  }

  await subUsage(providerKey, size);

  return true;
}

// Trích public_id từ URL Cloudinary dạng:
//   https://res.cloudinary.com/<cloud>/image/upload/v169.../manganest/avatar/abc123.jpg
// -> "manganest/avatar/abc123"
function extractCloudinaryPublicId(url) {
  const afterUpload = url.split("/upload/")[1];

  if (!afterUpload) return null;

  return afterUpload.replace(/^v\d+\//, "").replace(/\.[^/.]+$/, "");
}

// Xóa dựa theo URL công khai (dùng cho các chỗ chỉ lưu URL, không lưu
// riêng public_id, ví dụ avatar). Trả về true nếu đã xóa.
async function deleteByUrl(url) {
  if (!url) return false;

  if (
    cloudinaryProvider.configured &&
    url.includes("res.cloudinary.com") &&
    url.includes(`/${process.env.CLOUDINARY_CLOUD_NAME}/`)
  ) {
    const publicId = extractCloudinaryPublicId(url);

    if (!publicId) return false;

    return deleteByPublicId(`${cloudinaryProvider.key}:${publicId}`);
  }

  const provider = PROVIDERS.find(
    (p) =>
      p.type !== "cloudinary" &&
      p.configured &&
      url.startsWith(`${p.publicBaseUrl}/`),
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

const fs = require("fs");
const path = require("path");

const {
  PutObjectCommand,
  DeleteObjectCommand,
  DeleteObjectsCommand,
  HeadObjectCommand,
  ListObjectsV2Command,
  CopyObjectCommand,
} = require("@aws-sdk/client-s3");

const supabase = require("../config/supabase");
const StorageUsage = require("../models/StorageUsage");

// =========================
// Cover / Banner / Avatar / Sample-images / Ảnh trang Chapter storage manager
// =========================
// Provider duy nhất cho MỌI loại ảnh upload MỚI (cover, banner, avatar,
// sample-images, và cả ảnh trang chapter) kể từ khi Cloudinary free tier
// bị đạt giới hạn dung lượng. Ảnh chapter CŨ đã upload trước đó vẫn còn
// nguyên trên Cloudinary và vẫn đọc được bình thường (KHÔNG bị migrate
// ngược lại) — mangaController.js chỉ đổi chiều UPLOAD MỚI sang đây, các
// URL Cloudinary cũ lưu sẵn trong DB (chapter.pages[].url) không hề bị đụng
// tới nên vẫn hiển thị/đọc được như cũ.
//
// Storage provider: Supabase Storage (S3-compatible), xem chi tiết ENV cần
// thiết trong config/supabase.js. STORAGE_LIMIT_BYTES vẫn được giữ lại để
// theo dõi dung lượng đã dùng (StorageUsage / Mongo) và cảnh báo qua log
// khi gần/đã vượt ngưỡng, để chủ động nâng cấp gói Supabase.

const PROVIDERS = [supabase];

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
      "Chưa cấu hình storage provider nào (Supabase Storage). Kiểm tra lại biến môi trường.",
    );
  }

  for (const provider of configuredProviders) {
    const usage = await StorageUsage.findOne({ provider: provider.key });
    const bytesUsed = usage ? usage.bytesUsed : 0;

    if (bytesUsed < STORAGE_LIMIT_BYTES) {
      return provider;
    }
  }

  // Provider đã đầy -> vẫn cố upload (best-effort), đồng thời cảnh báo ra
  // log để chủ động nâng cấp dung lượng gói Supabase.
  console.warn(
    "[storageManager] Storage provider đã đạt giới hạn " +
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

// Xóa TOÀN BỘ object nằm trong 1 "folder" (prefix dạng key, không có dấu
// "/" ở cuối) — dùng thay cho cặp cloudinary.api.delete_resources_by_prefix
// + delete_folder khi xóa nguyên 1 chapter hoặc dọn folder tạm lúc sửa
// chapter. S3/Supabase không có khái niệm folder thật nên không cần bước
// "xóa folder rỗng" như Cloudinary, chỉ cần xóa hết object có Key bắt đầu
// bằng "<prefix>/" là xong.
//
// Best-effort trên MỌI provider đã cấu hình (kể cả provider hiện không
// active) để phòng trường hợp ảnh cũ từng nằm ở provider khác; provider
// nào không tìm thấy object nào thì coi như không có gì để xóa, không
// throw lỗi.
async function deleteByPrefix(prefix) {
  if (!prefix) return;

  const keyPrefix = `${prefix}/`;

  for (const provider of PROVIDERS.filter((p) => p.configured)) {
    let continuationToken;
    let bytesDeleted = 0;

    try {
      do {
        const listed = await provider.client.send(
          new ListObjectsV2Command({
            Bucket: provider.bucket,
            Prefix: keyPrefix,
            ContinuationToken: continuationToken,
          }),
        );

        const objects = listed.Contents || [];

        if (objects.length > 0) {
          await provider.client.send(
            new DeleteObjectsCommand({
              Bucket: provider.bucket,
              Delete: {
                Objects: objects.map((o) => ({ Key: o.Key })),
              },
            }),
          );

          bytesDeleted += objects.reduce((sum, o) => sum + (o.Size || 0), 0);
        }

        continuationToken = listed.IsTruncated
          ? listed.NextContinuationToken
          : undefined;
      } while (continuationToken);

      await subUsage(provider.key, bytesDeleted);
    } catch (err) {
      // Không chặn luồng chính (xóa chapter / dọn folder tạm) chỉ vì 1
      // provider lỗi — log lại để biết mà kiểm tra thủ công nếu cần.
      console.log(
        `[storageManager] Không xóa được prefix "${prefix}" trên ${provider.key}:`,
        err.message,
      );
    }
  }
}

// "Di chuyển" 1 object đã upload (dùng thay cho cloudinary.uploader.rename)
// — copy sang key mới trong newFolder (giữ nguyên tên file), rồi xóa key
// cũ. Dùng khi sửa chapter: ảnh mới được upload vào 1 folder TẠM trước,
// sau khi toàn bộ ảnh mới upload thành công mới move từng ảnh về folder
// chuẩn (đúng tên chapterNumber) để không tồn folder rác "_temp_..." trên
// Supabase. Nhận vào public_id dạng "<provider>:<key>", trả về
// {url, public_id} giống format uploadImage/uploadBuffer.
async function moveObject(publicId, newFolder) {
  if (!isManagedPublicId(publicId)) {
    throw new Error(
      `moveObject: public_id không thuộc storage đang quản lý: ${publicId}`,
    );
  }

  const [providerKey, ...rest] = publicId.split(":");
  const oldKey = rest.join(":");
  const provider = getProvider(providerKey);

  const fileName = oldKey.split("/").pop();
  const newKey = `${newFolder}/${fileName}`;

  await provider.client.send(
    new CopyObjectCommand({
      Bucket: provider.bucket,
      CopySource: `${provider.bucket}/${encodeURIComponent(oldKey)}`,
      Key: newKey,
    }),
  );

  await provider.client.send(
    new DeleteObjectCommand({ Bucket: provider.bucket, Key: oldKey }),
  );

  return {
    url: `${provider.publicBaseUrl}/${newKey}`,
    public_id: `${provider.key}:${newKey}`,
    provider: provider.key,
    key: newKey,
  };
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
module.exports.deleteByPrefix = deleteByPrefix;
module.exports.moveObject = moveObject;
module.exports.deleteByUrl = deleteByUrl;
module.exports.isManagedPublicId = isManagedPublicId;
module.exports.STORAGE_LIMIT_BYTES = STORAGE_LIMIT_BYTES;
module.exports.PROVIDERS = PROVIDERS;

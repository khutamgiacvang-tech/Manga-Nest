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

const cloudinaryStorage = require("../config/cloudinaryStorage");
const supabase = require("../config/supabase");
const StorageUsage = require("../models/StorageUsage");

// =========================
// Cover / Banner / Avatar / Sample-images / Ảnh trang Chapter storage manager
// =========================
// Danh sách provider được thử theo THỨ TỰ ƯU TIÊN: Cloudinary trước, sau
// đó mới tới Supabase Storage (S3-compatible). Nghĩa là:
//   - Nếu Cloudinary đã cấu hình (đủ ENV) và còn dưới ngưỡng dung lượng
//     (CLOUDINARY_LIMIT_BYTES, xem config/cloudinaryStorage.js) -> upload
//     MỚI sẽ luôn đi vào Cloudinary.
//   - Chỉ khi Cloudinary CHƯA cấu hình, hoặc đã đầy ngưỡng, mới tự động
//     rơi xuống Supabase Storage.
// Ảnh cũ (dù đang nằm ở Cloudinary hay Supabase) không hề bị đụng tới —
// file này chỉ quyết định nơi upload MỚI sẽ đi vào, các URL cũ lưu sẵn
// trong DB vẫn đọc bình thường vì mỗi loại provider tự biết cách xóa/di
// chuyển đúng theo tiền tố public_id "<provider>:<key>" của chính nó.

const PROVIDERS = [cloudinaryStorage, supabase];

// Giữ lại để tương thích ngược (một số nơi có thể import giá trị này) —
// nếu 1 provider không tự khai limitBytes riêng thì dùng ngưỡng chung này.
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

function getProviderLimit(provider) {
  return Number(provider.limitBytes) || STORAGE_LIMIT_BYTES;
}

function getProvider(providerKey) {
  const provider = PROVIDERS.find((p) => p.key === providerKey);

  if (!provider) {
    throw new Error(`Không tìm thấy storage provider: ${providerKey}`);
  }

  return provider;
}

// =========================
// Chọn provider đang active (Cloudinary trước, Supabase dự phòng)
// =========================

async function getActiveProvider(forceProviderKey) {
  // Ép dùng đúng 1 provider cụ thể — dùng khi muốn tách loại ảnh theo
  // provider cố định (vd: avatar/cover/banner luôn ở Supabase, ảnh trang
  // chapter luôn ở Cloudinary) thay vì để hệ thống tự chọn theo dung lượng.
  if (forceProviderKey) {
    const provider = getProvider(forceProviderKey);

    if (!provider.configured) {
      throw new Error(
        `Storage provider "${provider.label}" chưa được cấu hình (thiếu biến môi trường).`,
      );
    }

    const usage = await StorageUsage.findOne({ provider: provider.key });
    const bytesUsed = usage ? usage.bytesUsed : 0;

    console.log(
      `[storageManager] Provider "${provider.label}" ` +
        `(đã dùng ${(bytesUsed / (1024 * 1024)).toFixed(1)}MB / ` +
        `${(getProviderLimit(provider) / (1024 * 1024 * 1024)).toFixed(1)}GB)`,
    );

    return provider;
  }

  const configuredProviders = PROVIDERS.filter((p) => p.configured);

  if (configuredProviders.length === 0) {
    throw new Error(
      "Chưa cấu hình storage provider nào (Cloudinary / Supabase Storage). Kiểm tra lại biến môi trường.",
    );
  }

  for (const provider of configuredProviders) {
    const usage = await StorageUsage.findOne({ provider: provider.key });
    const bytesUsed = usage ? usage.bytesUsed : 0;

    if (bytesUsed < getProviderLimit(provider)) {
      console.log(
        `[storageManager] Provider "${provider.label}" ` +
          `(đã dùng ${(bytesUsed / (1024 * 1024)).toFixed(1)}MB / ` +
          `${(getProviderLimit(provider) / (1024 * 1024 * 1024)).toFixed(1)}GB)`,
      );

      return provider;
    }

    console.warn(
      `[storageManager] Provider "${provider.label}" đã đạt ngưỡng ` +
        `${(getProviderLimit(provider) / (1024 * 1024 * 1024)).toFixed(1)}GB, ` +
        "thử chuyển sang provider kế tiếp...",
    );
  }

  // Mọi provider đều đã đầy -> vẫn cố upload (best-effort) vào provider
  // ưu tiên cao nhất (Cloudinary nếu có cấu hình), đồng thời cảnh báo ra
  // log để chủ động nâng cấp dung lượng gói.
  console.warn(
    "[storageManager] TẤT CẢ storage provider đã đạt giới hạn dung lượng. " +
      "Đang upload tạm vào provider ưu tiên cao nhất, cân nhắc nâng cấp gói.",
  );

  return configuredProviders[0];
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
// Upload — nhánh riêng theo loại provider (cloudinary / s3)
// =========================

async function uploadToCloudinary(provider, buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = provider.client.uploader.upload_stream(
      { folder, resource_type: "image" },
      (err, result) => {
        if (err) return reject(err);

        resolve({
          url: result.secure_url,
          // Tiền tố "cloudinary:" để isManagedPublicId/deleteByPublicId
          // nhận biết và tách đúng public_id thật (result.public_id có
          // thể chứa "/" do nằm trong folder, nhưng không chứa ":").
          public_id: `${provider.key}:${result.public_id}`,
          provider: provider.key,
          key: result.public_id,
          bytes: result.bytes || buffer.length,
        });
      },
    );

    stream.end(buffer);
  });
}

async function uploadToS3(provider, buffer, folder, ext) {
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

  return {
    url: `${provider.publicBaseUrl}/${key}`,
    public_id: `${provider.key}:${key}`,
    provider: provider.key,
    key,
    bytes: buffer.length,
  };
}

async function uploadToActiveProvider(buffer, folder, ext, forceProviderKey) {
  const provider = await getActiveProvider(forceProviderKey);

  let result;

  try {
    if (provider.type === "cloudinary") {
      result = await uploadToCloudinary(provider, buffer, folder);
    } else {
      result = await uploadToS3(provider, buffer, folder, ext);
    }
  } catch (err) {
    // Nếu đang ép cứng 1 provider cụ thể (forceProviderKey), KHÔNG tự động
    // fallback sang provider khác — người gọi đã chủ động chọn provider
    // này (vd avatar luôn ở Supabase) nên để lỗi bung ra cho biết mà xử lý,
    // tránh âm thầm lưu nhầm sang provider khác.
    if (forceProviderKey) throw err;

    // Chế độ tự động (không ép provider) -> thử rơi xuống provider kế
    // tiếp trong danh sách khi provider ưu tiên gặp lỗi bất ngờ.
    const fallback = PROVIDERS.find(
      (p) => p.configured && p.key !== provider.key,
    );

    if (!fallback) throw err;

    console.warn(
      `[storageManager] Upload lên "${provider.label}" lỗi (${err.message}), ` +
        `thử fallback sang "${fallback.label}"...`,
    );

    result =
      fallback.type === "cloudinary"
        ? await uploadToCloudinary(fallback, buffer, folder)
        : await uploadToS3(fallback, buffer, folder, ext);
  }

  await addUsage(result.provider, result.bytes);

  return {
    url: result.url,
    public_id: result.public_id,
    provider: result.provider,
    key: result.key,
  };
}

// Upload từ file path trên đĩa (giữ nguyên chữ ký giống cloudinaryUpload cũ
// để các chỗ gọi trong controllers không phải đổi nhiều).
// options.provider (tùy chọn): "cloudinary" | "supabase" -> ép upload vào
// đúng provider này thay vì để hệ thống tự chọn theo dung lượng còn trống.
async function uploadImage(filePath, folder, options = {}) {
  const buffer = fs.readFileSync(filePath);
  const ext = path.extname(filePath).toLowerCase();

  return uploadToActiveProvider(buffer, folder, ext, options.provider);
}

// Upload thẳng từ buffer trong RAM (multer.memoryStorage)
// options.provider (tùy chọn): xem giải thích ở uploadImage() phía trên.
async function uploadBuffer(buffer, folder, originalName, options = {}) {
  const ext = originalName
    ? path.extname(originalName).toLowerCase()
    : ".jpg";

  return uploadToActiveProvider(buffer, folder, ext || ".jpg", options.provider);
}

// =========================
// Xóa
// =========================

// Nhận vào public_id dạng "<provider>:<key>" (do uploadImage/uploadBuffer ở
// trên trả về). Trả về true nếu đã xóa, false nếu publicId không thuộc
// storage đang quản lý (vd public_id kiểu Cloudinary "trần", không có tiền
// tố provider — ảnh chapter cũ trước khi có storageManager) -> để caller tự
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

    await provider.client.uploader.destroy(key, {
      resource_type: "image",
      invalidate: true,
    });
  } else {
    try {
      const head = await provider.client.send(
        new HeadObjectCommand({ Bucket: provider.bucket, Key: key }),
      );

      size = head.ContentLength || 0;
    } catch (err) {
      // Không lấy được size (có thể file đã bị xóa trước đó) -> vẫn tiếp
      // tục xóa, chỉ là không trừ được usage chính xác.
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

// Xóa TOÀN BỘ object nằm trong 1 "folder" (prefix) — dùng thay cho cặp
// cloudinary.api.delete_resources_by_prefix + delete_folder khi xóa nguyên
// 1 chapter hoặc dọn folder tạm lúc sửa chapter.
//
// Best-effort trên MỌI provider đã cấu hình (kể cả provider hiện không
// active) để phòng trường hợp ảnh cũ từng nằm ở provider khác; provider
// nào không tìm thấy object nào thì coi như không có gì để xóa, không
// throw lỗi.
async function deleteByPrefix(prefix) {
  if (!prefix) return;

  for (const provider of PROVIDERS.filter((p) => p.configured)) {
    if (provider.type === "cloudinary") {
      let bytesDeleted = 0;

      try {
        try {
          const listed = await provider.client.api.resources({
            type: "upload",
            prefix: `${prefix}/`,
            max_results: 500,
          });

          bytesDeleted = (listed.resources || []).reduce(
            (sum, r) => sum + (r.bytes || 0),
            0,
          );
        } catch (err) {
          console.log(
            `[storageManager] Không liệt kê được resource Cloudinary prefix "${prefix}":`,
            err.message,
          );
        }

        await provider.client.api.delete_resources_by_prefix(`${prefix}/`);
        await provider.client.api.delete_folder(prefix);

        await subUsage(provider.key, bytesDeleted);
      } catch (err) {
        console.log(
          `[storageManager] Không xóa được prefix "${prefix}" trên Cloudinary:`,
          err.message,
        );
      }

      continue;
    }

    const keyPrefix = `${prefix}/`;
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
// chuẩn (đúng tên chapterNumber). Nhận vào public_id dạng
// "<provider>:<key>", trả về {url, public_id} giống format
// uploadImage/uploadBuffer.
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

  if (provider.type === "cloudinary") {
    const result = await provider.client.uploader.rename(oldKey, newKey, {
      resource_type: "image",
      overwrite: true,
    });

    return {
      url: result.secure_url,
      public_id: `${provider.key}:${result.public_id}`,
      provider: provider.key,
      key: result.public_id,
    };
  }

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

// Trích public_id gốc của Cloudinary từ 1 secure_url, vd:
//   https://res.cloudinary.com/<cloud>/image/upload/v169.../folder/name.jpg
//   -> "folder/name"
// Trả về null nếu url không thuộc cloud_name đang cấu hình.
function extractCloudinaryPublicId(url, provider) {
  const cloudName = provider.client.config().cloud_name;

  if (!cloudName) return null;

  const prefix = `https://res.cloudinary.com/${cloudName}/image/upload/`;

  if (!url.startsWith(prefix)) return null;

  let rest = url.slice(prefix.length);

  // Bỏ query string (nếu có) và segment version "v1234567890/" (nếu có).
  rest = rest.split("?")[0];
  rest = rest.replace(/^v\d+\//, "");

  // Bỏ phần đuôi file (extension) để ra đúng public_id.
  const lastDot = rest.lastIndexOf(".");
  const publicId = lastDot > -1 ? rest.slice(0, lastDot) : rest;

  return publicId || null;
}

// Xóa dựa theo URL công khai (dùng cho các chỗ chỉ lưu URL, không lưu
// riêng public_id, ví dụ avatar). Trả về true nếu đã xóa.
async function deleteByUrl(url) {
  if (!url) return false;

  // Thử khớp theo Supabase/S3 trước (publicBaseUrl cố định, dễ so khớp).
  const s3Provider = PROVIDERS.find(
    (p) =>
      p.configured &&
      p.type === "s3" &&
      url.startsWith(`${p.publicBaseUrl}/`),
  );

  if (s3Provider) {
    const key = url.slice(s3Provider.publicBaseUrl.length + 1).split("?")[0];

    return deleteByPublicId(`${s3Provider.key}:${key}`);
  }

  // Không khớp Supabase -> thử khớp theo Cloudinary (parse public_id từ
  // chính URL vì Cloudinary không có 1 publicBaseUrl cố định như S3).
  const cloudinaryProvider = PROVIDERS.find(
    (p) => p.configured && p.type === "cloudinary",
  );

  if (cloudinaryProvider) {
    const publicId = extractCloudinaryPublicId(url, cloudinaryProvider);

    if (publicId) {
      return deleteByPublicId(`${cloudinaryProvider.key}:${publicId}`);
    }
  }

  return false;
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

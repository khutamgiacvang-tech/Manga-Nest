const cloudinary = require("../config/cloudinary");

async function uploadImage(filePath, folder) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder,
  });

  return {
    url: result.secure_url,
    public_id: result.public_id,
  };
}

// Upload thẳng từ buffer trong RAM (multer.memoryStorage) -> Cloudinary,
// không cần ghi file tạm ra ổ đĩa trước.
function uploadBuffer(buffer, folder) {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder },
      (err, result) => {
        if (err) return reject(err);

        resolve({
          url: result.secure_url,
          public_id: result.public_id,
        });
      },
    );

    stream.end(buffer);
  });
}

module.exports = uploadImage;
module.exports.uploadBuffer = uploadBuffer;

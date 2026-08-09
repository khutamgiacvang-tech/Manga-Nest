const cloudinary = require("../config/cloudinary");

async function uploadChapterImage(filePath, mangaSlug, chapterNumber, page) {
  const result = await cloudinary.uploader.upload(filePath, {
    folder: `manganest/${mangaSlug}/chapter-${chapterNumber}`,
    public_id: String(page),
  });

  return result.secure_url;
}

module.exports = uploadChapterImage;

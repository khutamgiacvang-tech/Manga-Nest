const express = require("express");
const router = express.Router();

const homeController = require("../controllers/homeController");
const path = require("path");

router.get("/download/manganest.apk", (req, res) => {
  const apkPath = path.join(__dirname, "../public/download/manganest.apk");
  return res.download(apkPath, "MangaNest.apk", {
    headers: {
      "Content-Type": "application/vnd.android.package-archive",
      "Cache-Control": "public, max-age=3600"
    }
  }, (err) => {
    if (err && !res.headersSent) {
      console.error("APK DOWNLOAD ERROR:", err);
      return res.status(404).send("Không tìm thấy file APK.");
    }
  });
});

router.get("/", homeController.home);

router.get("/policy", homeController.policy);

router.get("/support", homeController.support);

module.exports = router;

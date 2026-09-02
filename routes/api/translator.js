const express = require("express");
const router = express.Router();
const multer = require("multer");
const translatorApi = require("../../controllers/api/translatorApiController");
const { requireAuth } = require("../../middleware/apiAuth");

// Upload thẳng vào RAM rồi đẩy lên Supabase (xem translatorApiController.js),
// giống hệt cách web làm ở routes/translator.js.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 10 * 1024 * 1024 },
});

router.use(requireAuth);
router.get("/applications", translatorApi.myApplications);
router.get("/application", translatorApi.myApplication);
router.post("/application", upload.array("sampleImages", 5), translatorApi.submitApplication);

module.exports = router;

const express = require("express");
const router = express.Router();
const translatorApi = require("../../controllers/api/translatorApiController");
const { requireAuth } = require("../../middleware/apiAuth");

router.use(requireAuth);
router.get("/applications", translatorApi.myApplications);
router.get("/application", translatorApi.myApplication);

module.exports = router;

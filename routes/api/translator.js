const express = require("express");
const router = express.Router();
const { requireAuth } = require("../../middleware/apiAuth");
const translatorApi = require("../../controllers/api/translatorApiController");
router.get("/application", requireAuth, translatorApi.myApplication);
module.exports = router;

const express = require("express");
const router = express.Router();

const notificationApi = require("../../controllers/api/notificationApiController");
const { requireAuth } = require("../../middleware/apiAuth");

router.get("/", requireAuth, notificationApi.list);
router.post("/expo-token", requireAuth, notificationApi.saveExpoToken);
router.post("/expo-token/remove", requireAuth, notificationApi.removeExpoToken);
router.post("/:id/read", requireAuth, notificationApi.readNotification);
router.post("/read-all", requireAuth, notificationApi.readAll);

module.exports = router;

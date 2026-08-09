const express = require("express");

const router = express.Router();

const notificationController = require("../controllers/notificationController");

router.post(

    "/notification/read/:id",

    notificationController.readNotification

);

router.post(

    "/notification/read-all",

    notificationController.readAll

);

module.exports = router;
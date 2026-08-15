const express = require("express");

const router = express.Router();

const notificationController = require("../controllers/notificationController");

router.get(

    "/notifications",

    notificationController.list

);

router.post(

    "/notification/read/:id",

    notificationController.readNotification

);

router.post(

    "/notification/read-all",

    notificationController.readAll

);

module.exports = router;
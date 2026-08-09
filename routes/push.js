const express = require("express");
const router = express.Router();
const webpush = require("web-push");

webpush.setVapidDetails(
    "mailto:support@manganest.com",
    process.env.VAPID_PUBLIC_KEY,
    process.env.VAPID_PRIVATE_KEY
);

router.get("/vapid-public-key", (req, res) => {
    res.status(200).json({ publicKey: process.env.VAPID_PUBLIC_KEY });
});

router.post("/save-subscription", async (req, res) => {
    console.log("SAVE-SUB USER =", req.user?.username);
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
        req.user.pushSubscription = req.body;
        await req.user.save();
        console.log("SUB SAVED SUCCESSFULLY");
        res.status(200).json({ success: true, message: "Subscription saved successfully" });
    } catch (err) {
        console.error("Lỗi lưu push subscription:", err);
        res.status(500).json({ success: false, message: "Failed to save subscription" });
    }
});

router.post("/remove-subscription", async (req, res) => {
    console.log("REMOVE-SUB USER =", req.user?.username);
    if (!req.user) {
        return res.status(401).json({ success: false, message: "Unauthorized" });
    }

    try {
        // Dùng null thay vì undefined để Mongoose chịu xóa trắng trường này trong DB
        req.user.pushSubscription = null;
        await req.user.save();
        console.log("SUB REMOVED SUCCESSFULLY");
        res.status(200).json({ success: true, message: "Subscription removed successfully" });
    } catch (err) {
        console.error("Lỗi xoá push subscription:", err);
        res.status(500).json({ success: false, message: "Failed to remove subscription" });
    }
});

module.exports = router;
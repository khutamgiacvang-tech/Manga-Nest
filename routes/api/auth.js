const express = require("express");
const router = express.Router();

const authApi = require("../../controllers/api/authApiController");
const { requireAuth } = require("../../middleware/apiAuth");

// POST /api/v1/auth/register
router.post("/register", authApi.register);

// POST /api/v1/auth/login  -> { accessToken, refreshToken, user }
router.post("/login", authApi.login);

// POST /api/v1/auth/refresh -> { accessToken }
router.post("/refresh", authApi.refresh);

// GET /api/v1/auth/me  (cần Authorization: Bearer <accessToken>)
router.get("/me", requireAuth, authApi.me);

module.exports = router;

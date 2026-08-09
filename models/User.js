const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const userSchema = new mongoose.Schema(
  {
    username: {
      type: String,
      required: true,
      trim: true,
    },

    email: {
      type: String,
      required: true,
      unique: true,
      lowercase: true,
      trim: true,
    },

    password: {
      type: String,
      default: null,
    },

    avatar: {
      type: String,
      default: "/images/icon/avatar.png",
    },

    bio: {
      type: String,
      default: "",
    },

    // =========================
    // Thông tin nhóm dịch
    // =========================

    displayName: {
      type: String,
      default: "",
    },

    facebook: {
      type: String,
      default: "",
    },

    discord: {
      type: String,
      default: "",
    },

    description: {
      type: String,
      default: "",
    },

    // =========================
    // Đăng nhập
    // =========================

    provider: {
      type: String,
      enum: ["local", "google", "discord"],
      default: "local",
    },

    googleId: {
      type: String,
      default: null,
      index: true,
    },

    discordId: {
      type: String,
      default: null,
      index: true,
    },

    role: {
      type: String,
      enum: ["user", "translator", "admin"],
      default: "user",
    },

    status: {
      type: String,
      enum: ["active", "banned"],
      default: "active",
    },

    // =========================
    // Ban Account
    // =========================

    isBanned: {
      type: Boolean,
      default: false,
    },

    banReason: {
      type: String,
      default: "",
    },

    banUntil: {
      type: Date,
      default: null,
    },

    isPermanentBan: {
      type: Boolean,
      default: false,
    },

    // =========================
    // Quên mật khẩu / Reset password
    // =========================

    resetPasswordToken: {
      type: String,
      default: null,
    },

    resetPasswordExpires: {
      type: Date,
      default: null,
    },

    followedManga: [
      {
        type: mongoose.Schema.Types.ObjectId,
        ref: "Manga",
      },
    ],

    // =========================
    // Web Push Notification
    // =========================

    pushSubscription: {
      type: Object,
      default: null,
    },

    // Đã từng thấy popup gợi ý bật thông báo đẩy (hiện khi follow truyện lần đầu) hay chưa
    hasSeenNotifPrompt: {
      type: Boolean,
      default: false,
    },
  },
  {
    timestamps: true,
  },
);

// ==============================
// Hash password
// ==============================

userSchema.pre("save", async function () {
  if (!this.isModified("password") || !this.password) {
    return;
  }

  this.password = await bcrypt.hash(this.password, 10);
});

// ==============================
// Compare password
// ==============================

userSchema.methods.comparePassword = function (password) {
  if (!this.password) {
    return false;
  }

  return bcrypt.compare(password, this.password);
};

module.exports = mongoose.model("User", userSchema);

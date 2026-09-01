const TranslatorApplication = require("../../models/TranslatorApplication");
const User = require("../../models/User");
const Notification = require("../../models/Notification");
const { uploadBuffer } = require("../../utils/storageManager");

function arr(value) { return Array.isArray(value) ? value : value === undefined ? [] : [value]; }

exports.myApplication = async (req, res) => {
  try {
    const application = await TranslatorApplication.findOne({ user: req.user._id }).sort({ createdAt: -1 }).lean();
    if (application) {
      application.projects = application.projects || [];
      application.profiles = application.profiles || [];
      application.sampleImages = (application.sampleImages || []).filter((x) => typeof x === "string" && x.startsWith("http"));
    }
    return res.json({ success: true, application });
  } catch (err) {
    console.error("[api/translator/application:get]", err);
    return res.status(500).json({ success: false, message: "Không thể tải đơn Translator." });
  }
};

exports.submitApplication = async (req, res) => {
  try {
    const user = await User.findById(req.user._id);
    if (!user) return res.status(404).json({ success: false, message: "Không tìm thấy tài khoản." });
    if (user.role === "translator" || user.role === "admin") {
      return res.status(409).json({ success: false, message: "Tài khoản của bạn đã có quyền Translator." });
    }

    const existed = await TranslatorApplication.findOne({ user: user._id, status: "pending" });
    if (existed) {
      return res.status(409).json({ success: false, message: "Bạn đã có đơn Translator đang chờ xét duyệt." });
    }

    const introduction = String(req.body.introduction || "").trim();
    if (!introduction) return res.status(400).json({ success: false, message: "Vui lòng giới thiệu bản thân." });

    const titles = arr(req.body.projectTitle), websites = arr(req.body.projectWebsite), links = arr(req.body.projectLink);
    const projects = titles.map((title, i) => ({ title: String(title || "").trim(), website: String(websites[i] || "").trim(), link: String(links[i] || "").trim() })).filter(p => p.title);
    const pweb = arr(req.body.profileWebsite), plink = arr(req.body.profileLink);
    const profiles = pweb.map((website, i) => ({ website: String(website || "").trim(), link: String(plink[i] || "").trim() })).filter(p => p.website);

    const sampleImages = [];
    for (const file of (req.files || []).slice(0, 5)) {
      const uploaded = await uploadBuffer(file.buffer, "manganest/translator-applications", file.originalname, { provider: "supabase" });
      if (uploaded?.url && typeof uploaded.url === "string") sampleImages.push(uploaded.url);
    }

    const application = await TranslatorApplication.create({
      user: user._id,
      groupName: String(req.body.groupName || "").trim(),
      introduction,
      projects,
      profiles,
      sampleImages,
      note: String(req.body.note || "").trim(),
      status: "pending",
    });

    const admins = await User.find({ role: "admin" }).select("_id").lean();
    for (const admin of admins) {
      await Notification.create({ user: admin._id, title: "📩 Đơn Translator mới", message: `${user.username} vừa gửi đơn xin Translator.`, link: "/admin", image: "/images/icon/favicon.png" });
    }
    return res.status(201).json({ success: true, message: "Đã gửi đơn xin cấp quyền Translator.", application });
  } catch (err) {
    console.error("[api/translator/application:post]", err);
    return res.status(500).json({ success: false, message: "Có lỗi xảy ra khi gửi đơn." });
  }
};

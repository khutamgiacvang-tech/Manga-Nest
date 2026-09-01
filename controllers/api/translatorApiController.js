const TranslatorApplication = require("../../models/TranslatorApplication");

exports.myApplication = async (req, res) => {
  try {
    const application = await TranslatorApplication.findOne({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    if (!application) return res.json({ success: true, application: null });

    application.projects = Array.isArray(application.projects) ? application.projects : [];
    application.profiles = Array.isArray(application.profiles) ? application.profiles : [];
    application.sampleImages = (application.sampleImages || []).filter(
      (img) => typeof img === "string" && img.startsWith("http")
    );

    return res.json({ success: true, application });
  } catch (err) {
    console.error("[api/translator/application]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

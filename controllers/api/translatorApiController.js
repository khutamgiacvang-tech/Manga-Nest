const TranslatorApplication = require("../../models/TranslatorApplication");

exports.myApplications = async (req, res) => {
  try {
    const applications = await TranslatorApplication.find({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    for (const application of applications) {
      application.projects = application.projects || [];
      application.profiles = application.profiles || [];
      application.sampleImages = (application.sampleImages || []).filter(
        (img) => typeof img === "string" && img.startsWith("http")
      );
    }

    return res.json({ success: true, applications });
  } catch (err) {
    console.error("[api/translator/applications]", err);
    return res.status(500).json({
      success: false,
      message: "Không thể tải các đơn Translator."
    });
  }
};

exports.myApplication = async (req, res) => {
  try {
    const application = await TranslatorApplication.findOne({ user: req.user._id })
      .sort({ createdAt: -1 })
      .lean();

    if (application) {
      application.projects = application.projects || [];
      application.profiles = application.profiles || [];
      application.sampleImages = (application.sampleImages || []).filter(
        (img) => typeof img === "string" && img.startsWith("http")
      );
    }

    return res.json({ success: true, application: application || null });
  } catch (err) {
    console.error("[api/translator/application]", err);
    return res.status(500).json({
      success: false,
      message: "Không thể tải đơn Translator."
    });
  }
};

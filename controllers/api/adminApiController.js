const User = require("../../models/User");
const TranslatorApplication = require("../../models/TranslatorApplication");
const Manga = require("../../models/Manga");
const Notification = require("../../models/Notification");

function isAdmin(req) { return req.user?.role === "admin"; }

exports.dashboard = async (req, res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({ success: false, message: "Bạn không có quyền quản trị." });

    const [pendingApplications, approvedApplications, rejectedApplications, pendingMangas,
      approvedMangas, rejectedMangas, totalUsers, totalTranslators, totalAdmins] = await Promise.all([
      TranslatorApplication.find({ status: "pending" }).populate("user", "username displayName email avatar role").sort({ createdAt: -1 }).lean(),
      TranslatorApplication.find({ status: "approved" }).populate("user", "username displayName email avatar role").sort({ updatedAt: -1 }).lean(),
      TranslatorApplication.find({ status: "rejected" }).populate("user", "username displayName email avatar role").sort({ updatedAt: -1 }).lean(),
      Manga.find({ status: "pending" }).populate("translator", "username displayName").sort({ createdAt: -1 }).lean(),
      Manga.find({ status: "approved" }).populate("translator", "username displayName").sort({ updatedAt: -1 }).lean(),
      Manga.find({ status: "rejected" }).populate("translator", "username displayName").sort({ updatedAt: -1 }).lean(),
      User.countDocuments({ role: "user" }), User.countDocuments({ role: "translator" }), User.countDocuments({ role: "admin" }),
    ]);

    const map = (items, type) => items.map(data => ({ type, data }));
    const pending = [...map(pendingApplications, "translator"), ...map(pendingMangas, "manga")]
      .sort((a,b) => new Date(b.data.createdAt) - new Date(a.data.createdAt));
    const approved = [...map(approvedApplications, "translator"), ...map(approvedMangas, "manga")]
      .sort((a,b) => new Date(b.data.updatedAt || b.data.createdAt) - new Date(a.data.updatedAt || a.data.createdAt));
    const rejected = [...map(rejectedApplications, "translator"), ...map(rejectedMangas, "manga")]
      .sort((a,b) => new Date(b.data.updatedAt || b.data.createdAt) - new Date(a.data.updatedAt || a.data.createdAt));

    return res.json({ success: true, pending, approved, rejected,
      counts: { pending: pending.length, approved: approved.length, rejected: rejected.length,
        users: totalUsers, translators: totalTranslators, admins: totalAdmins } });
  } catch (err) {
    console.error("[api/admin/dashboard]", err);
    return res.status(500).json({ success: false, message: "Lỗi máy chủ." });
  }
};

exports.approveApplication = async (req,res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({success:false,message:"Không có quyền."});
    const app = await TranslatorApplication.findById(req.params.id);
    if (!app) return res.status(404).json({success:false,message:"Không tìm thấy đơn."});
    if (app.status !== "pending") return res.json({success:false,message:"Đơn đã được xử lý."});
    app.status="approved"; await app.save();
    await User.findByIdAndUpdate(app.user,{role:"translator"});
    await Notification.create({user:app.user,title:"🎉 Đơn Translator",message:"Đơn của bạn đã được chấp nhận.",link:"/profile",image:"/images/icon/favicon.png"});
    return res.json({success:true});
  } catch(err) { console.error(err); return res.status(500).json({success:false,message:"Lỗi máy chủ."}); }
};

exports.rejectApplication = async (req,res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({success:false,message:"Không có quyền."});
    const app = await TranslatorApplication.findById(req.params.id);
    if (!app) return res.status(404).json({success:false,message:"Không tìm thấy đơn."});
    if (app.status !== "pending") return res.json({success:false,message:"Đơn đã được xử lý."});
    app.status="rejected"; await app.save();
    await Notification.create({user:app.user,title:"❌ Đơn Translator",message:"Đơn của bạn đã bị từ chối.",link:"/translator/application",image:"/images/icon/favicon.png"});
    return res.json({success:true});
  } catch(err) { console.error(err); return res.status(500).json({success:false,message:"Lỗi máy chủ."}); }
};

exports.approveManga = async (req,res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({success:false,message:"Không có quyền."});
    const manga=await Manga.findById(req.params.id); if(!manga) return res.status(404).json({success:false,message:"Không tìm thấy truyện."});
    if(manga.status!=="pending") return res.json({success:false,message:"Truyện đã được xử lý."});
    manga.status="approved"; await manga.save();
    if(manga.translator) await Notification.create({user:manga.translator,title:"📖 Truyện được duyệt",message:`Truyện "${manga.title}" đã được Admin duyệt.`,link:`/manga/${manga.slug}`,image:manga.cover});
    return res.json({success:true});
  } catch(err){console.error(err);return res.status(500).json({success:false,message:"Lỗi máy chủ."});}
};

exports.rejectManga = async (req,res) => {
  try {
    if (!isAdmin(req)) return res.status(403).json({success:false,message:"Không có quyền."});
    const manga=await Manga.findById(req.params.id); if(!manga) return res.status(404).json({success:false,message:"Không tìm thấy truyện."});
    if(manga.status!=="pending") return res.json({success:false,message:"Truyện đã được xử lý."});
    manga.status="rejected"; await manga.save();
    if(manga.translator) await Notification.create({user:manga.translator,title:"❌ Truyện bị từ chối",message:`Truyện "${manga.title}" đã bị Admin từ chối.`,link:"/upload",image:manga.cover});
    return res.json({success:true});
  } catch(err){console.error(err);return res.status(500).json({success:false,message:"Lỗi máy chủ."});}
};

const User = require("../../models/User");
const TranslatorApplication = require("../../models/TranslatorApplication");
const Manga = require("../../models/Manga");
const Comment = require("../../models/Comment");
const Chapter = require("../../models/Chapter");
const Category = require("../../models/Category");
const Notification = require("../../models/Notification");

function isAdmin(req) { return req.user?.role === "admin"; }
function denied(res) { return res.status(403).json({ success:false, message:"Bạn không có quyền quản trị." }); }

exports.dashboard = async (req,res) => {
  try {
    if (!isAdmin(req)) return denied(res);

    // Mobile admin uses sectioned requests so opening one tab does not
    // download hundreds of comments/chapters and all other admin data.
    const section = String(req.query?.section || "approval");

    const map=(items,type)=>items.map(data=>({type,data}));
    if (section === "approval") {
      const [
        pendingApplications, approvedApplications, rejectedApplications,
        pendingMangas, approvedMangas, rejectedMangas,
        users, translators, admins
      ] = await Promise.all([
        TranslatorApplication.find({status:"pending"}).populate("user","username displayName email avatar role").sort({createdAt:-1}).lean(),
        TranslatorApplication.find({status:"approved"}).populate("user","username displayName email avatar role").sort({updatedAt:-1}).lean(),
        TranslatorApplication.find({status:"rejected"}).populate("user","username displayName email avatar role").sort({updatedAt:-1}).lean(),
        Manga.find({status:"pending"}).populate("translator","username displayName").sort({createdAt:-1}).lean(),
        Manga.find({status:"approved"}).populate("translator","username displayName").sort({updatedAt:-1}).lean(),
        Manga.find({status:"rejected"}).populate("translator","username displayName").sort({updatedAt:-1}).lean(),
        User.countDocuments({role:"user"}), User.countDocuments({role:"translator"}), User.countDocuments({role:"admin"})
      ]);
      const pending=[...map(pendingApplications,"translator"),...map(pendingMangas,"manga")].sort((a,b)=>new Date(b.data.createdAt)-new Date(a.data.createdAt));
      const approved=[...map(approvedApplications,"translator"),...map(approvedMangas,"manga")].sort((a,b)=>new Date(b.data.updatedAt||b.data.createdAt)-new Date(a.data.updatedAt||a.data.createdAt));
      const rejected=[...map(rejectedApplications,"translator"),...map(rejectedMangas,"manga")].sort((a,b)=>new Date(b.data.updatedAt||b.data.createdAt)-new Date(a.data.updatedAt||a.data.createdAt));
      return res.json({success:true,pending,approved,rejected,counts:{pending:pending.length,approved:approved.length,rejected:rejected.length,users,translators,admins}});
    }

    if (section === "users") {
      const [users,translators,admins]=await Promise.all([
        User.find({role:{$ne:"admin"}}).select("username displayName email avatar role status banUntil isPermanentBan banReason createdAt").sort({createdAt:-1}).lean(),
        User.find({role:"translator"}).select("username displayName email avatar role status banUntil isPermanentBan banReason createdAt").sort({createdAt:-1}).lean(),
        User.countDocuments({role:"admin"})
      ]);
      return res.json({success:true,users,translators,counts:{admins}});
    }

    if (section === "comments") {
      const comments=await Comment.find({}).populate("user","username displayName avatar").populate("manga","title slug").populate("chapter","chapterNumber").sort({createdAt:-1}).limit(300).lean();
      return res.json({success:true,comments});
    }

    if (section === "chapters") {
      const chapters=await Chapter.find({}).populate("manga","title slug cover").populate("uploadedBy","username displayName").sort({createdAt:-1}).limit(300).lean();
      return res.json({success:true,chapters});
    }

    if (section === "categories") {
      const categories=await Category.find({}).sort({name:1}).lean();
      return res.json({success:true,categories});
    }

    return res.status(400).json({success:false,message:"Section không hợp lệ."});
  } catch(e) { console.error("[api/admin/dashboard]",e); return res.status(500).json({success:false,message:"Lỗi máy chủ."}); }
};

exports.getApplication = async (req,res) => {
  try {
    if (!isAdmin(req)) return denied(res);
    const application = await TranslatorApplication.findById(req.params.id)
      .populate("user","username displayName email avatar role status")
      .lean();
    if (!application) return res.status(404).json({success:false,message:"Không tìm thấy đơn."});
    return res.json({success:true,application});
  } catch(e) {
    console.error("[api/admin/application]",e);
    return res.status(500).json({success:false,message:"Lỗi máy chủ."});
  }
};

exports.getManga = async (req,res) => {
  try {
    if (!isAdmin(req)) return denied(res);
    const manga = await Manga.findById(req.params.id)
      .populate("translator","username displayName email avatar role")
      .lean();
    if (!manga) return res.status(404).json({success:false,message:"Không tìm thấy truyện."});
    return res.json({success:true,manga});
  } catch(e) {
    console.error("[api/admin/manga]",e);
    return res.status(500).json({success:false,message:"Lỗi máy chủ."});
  }
};

exports.approveApplication=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const a=await TranslatorApplication.findById(req.params.id);if(!a)return res.status(404).json({success:false,message:"Không tìm thấy đơn."});if(a.status!=="pending")return res.json({success:false,message:"Đơn đã được xử lý."});a.status="approved";await a.save();await User.findByIdAndUpdate(a.user,{role:"translator"});await Notification.create({user:a.user,title:"🎉 Đơn Translator",message:"Đơn của bạn đã được chấp nhận.",link:"/profile",image:"/images/icon/favicon.png"});res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:"Lỗi máy chủ."});}};
exports.rejectApplication=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const a=await TranslatorApplication.findById(req.params.id);if(!a)return res.status(404).json({success:false,message:"Không tìm thấy đơn."});if(a.status!=="pending")return res.json({success:false,message:"Đơn đã được xử lý."});a.status="rejected";await a.save();await Notification.create({user:a.user,title:"❌ Đơn Translator",message:"Đơn của bạn đã bị từ chối.",link:"/translator/application",image:"/images/icon/favicon.png"});res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:"Lỗi máy chủ."});}};
exports.approveManga=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const m=await Manga.findById(req.params.id);if(!m)return res.status(404).json({success:false,message:"Không tìm thấy truyện."});if(m.status!=="pending")return res.json({success:false,message:"Truyện đã được xử lý."});m.status="approved";await m.save();if(m.translator)await Notification.create({user:m.translator,title:"📖 Truyện được duyệt",message:`Truyện "${m.title}" đã được Admin duyệt.`,link:`/manga/${m.slug}`,image:m.cover});res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:"Lỗi máy chủ."});}};
exports.rejectManga=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const m=await Manga.findById(req.params.id);if(!m)return res.status(404).json({success:false,message:"Không tìm thấy truyện."});if(m.status!=="pending")return res.json({success:false,message:"Truyện đã được xử lý."});m.status="rejected";await m.save();if(m.translator)await Notification.create({user:m.translator,title:"❌ Truyện bị từ chối",message:`Truyện "${m.title}" đã bị Admin từ chối.`,link:"/upload",image:m.cover});res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:"Lỗi máy chủ."});}};

exports.banUser=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const u=await User.findById(req.params.id);if(!u)return res.status(404).json({success:false,message:"Không tìm thấy tài khoản."});if(u.role==="admin")return res.json({success:false,message:"Không thể ban Admin."});const days=Number(req.body?.days),reason=req.body?.reason||"Không có.";u.status="banned";u.banReason=reason;if(days===-1){u.isPermanentBan=true;u.banUntil=null;}else{u.isPermanentBan=false;const d=new Date();d.setDate(d.getDate()+(days>0?days:7));u.banUntil=d;}await u.save();res.json({success:true,user:u});}catch(e){console.error(e);res.status(500).json({success:false,message:"Có lỗi xảy ra."});}};
exports.unbanUser=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const u=await User.findById(req.params.id);if(!u)return res.status(404).json({success:false,message:"Không tìm thấy tài khoản."});u.status="active";u.isPermanentBan=false;u.banUntil=null;u.banReason="";await u.save();res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:"Có lỗi xảy ra."});}};
exports.deleteUser=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const u=await User.findById(req.params.id);if(!u)return res.status(404).json({success:false,message:"Không tìm thấy tài khoản."});if(u.role==="admin")return res.json({success:false,message:"Không thể xóa Admin."});if(u.role==="translator"&&await Manga.exists({translator:u._id}))return res.json({success:false,message:"Không thể xóa Translator đang có truyện."});await User.findByIdAndDelete(u._id);res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:"Có lỗi xảy ra."});}};
exports.toggleHideComment=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const c=await Comment.findById(req.params.id);if(!c)return res.status(404).json({success:false,message:"Không tìm thấy bình luận."});c.isHidden=!c.isHidden;c.hiddenReason=c.isHidden?(req.body?.reason||"Vi phạm quy định nội dung."): "";await c.save();res.json({success:true,isHidden:c.isHidden});}catch(e){console.error(e);res.status(500).json({success:false,message:"Có lỗi xảy ra."});}};
exports.toggleHideChapter=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const c=await Chapter.findById(req.params.id);if(!c)return res.status(404).json({success:false,message:"Không tìm thấy chương."});c.isHidden=!c.isHidden;c.hiddenReason=c.isHidden?(req.body?.reason||"Vi phạm quy định nội dung."): "";await c.save();res.json({success:true,isHidden:c.isHidden});}catch(e){console.error(e);res.status(500).json({success:false,message:"Có lỗi xảy ra."});}};
exports.deleteChapter=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const c=await Chapter.findById(req.params.id);if(!c)return res.status(404).json({success:false,message:"Không tìm thấy chương."});c.pages=[];c.isHidden=true;c.isDeleted=true;c.hiddenReason=req.body?.reason||"Vi phạm quy định nội dung.";c.deletedAt=new Date();await c.save();res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:"Có lỗi xảy ra."});}};
exports.createCategory=async(req,res)=>{try{if(!isAdmin(req))return denied(res);const name=String(req.body?.name||"").trim();if(!name)return res.status(400).json({success:false,message:"Tên thể loại không được trống."});const exists=await Category.findOne({name});if(exists)return res.status(400).json({success:false,message:"Thể loại đã tồn tại."});const c=await Category.create({name});res.json({success:true,category:c});}catch(e){console.error(e);res.status(500).json({success:false,message:"Không thể tạo thể loại."});}};
exports.deleteCategory=async(req,res)=>{try{if(!isAdmin(req))return denied(res);await Category.findByIdAndDelete(req.params.id);res.json({success:true});}catch(e){console.error(e);res.status(500).json({success:false,message:"Không thể xóa thể loại."});}};

const nodemailer = require("nodemailer");

// =====================
// Transporter dùng chung
// =====================
// Cấu hình qua .env:
// EMAIL_HOST, EMAIL_PORT, EMAIL_USER, EMAIL_PASS, EMAIL_FROM
//
// Nếu dùng Gmail:
//   EMAIL_HOST=smtp.gmail.com
//   EMAIL_PORT=465
//   EMAIL_USER=youraccount@gmail.com
//   EMAIL_PASS=mật khẩu ứng dụng (App Password, KHÔNG phải mật khẩu Gmail thường)
//   EMAIL_FROM="MangaNest" <youraccount@gmail.com>
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST,
  port: Number(process.env.EMAIL_PORT) || 587,
  secure: Number(process.env.EMAIL_PORT) === 465, // true nếu port 465 (SSL)
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
});

// =====================
// Gửi mail reset mật khẩu
// =====================
exports.sendResetPasswordEmail = async ({ to, username, resetUrl }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || process.env.EMAIL_USER,
    to,
    subject: "MangaNest - Yêu cầu đặt lại mật khẩu",
    html: `
      <div style="font-family: Arial, sans-serif; max-width:520px; margin:0 auto; background:#17181f; color:#fff; padding:32px; border-radius:16px;">
        <h2 style="color:#ff4d4f; margin-bottom: 8px;">MangaNest</h2>
        <p>Xin chào <strong>${username || "bạn"}</strong>,</p>
        <p>
          Chúng tôi nhận được yêu cầu đặt lại mật khẩu cho tài khoản MangaNest
          gắn với email này. Nhấn vào nút bên dưới để đặt mật khẩu mới:
        </p>
        <p style="text-align:center; margin: 28px 0;">
          <a href="${resetUrl}"
             style="background:#ff4d4f; color:#fff; padding:12px 28px; border-radius:10px; text-decoration:none; font-weight:bold; display:inline-block;">
            Đặt lại mật khẩu
          </a>
        </p>
        <p>Hoặc copy link sau vào trình duyệt:</p>
        <p style="word-break:break-all; color:#9aa0ac;">${resetUrl}</p>
        <p style="color:#9aa0ac; font-size:13px; margin-top:24px;">
          Link này sẽ hết hạn sau 15 phút. Nếu bạn không yêu cầu đặt lại mật khẩu,
          vui lòng bỏ qua email này, tài khoản của bạn vẫn an toàn.
        </p>
      </div>
    `,
  };

  await transporter.sendMail(mailOptions);
};

const nodemailer = require("nodemailer");

// =====================
// Gmail SMTP Transporter
// =====================

const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",

  // Gmail SMTP dùng port 587
  port: Number(process.env.EMAIL_PORT) || 587,

  // Port 587 dùng STARTTLS
  secure: false,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,

  tls: {
    // STARTTLS trên port 587
    minVersion: "TLSv1.2",
  },
});

// =====================
// Gửi mail reset mật khẩu
// =====================

exports.sendResetPasswordEmail = async ({ to, username, resetUrl }) => {
  const mailOptions = {
    from: process.env.EMAIL_FROM || `MangaNest <${process.env.EMAIL_USER}>`,

    to,

    replyTo: process.env.EMAIL_USER,

    subject: "MangaNest - Yêu cầu đặt lại mật khẩu",

    html: `
<!DOCTYPE html>
<html lang="vi">

<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">

  <title>MangaNest - Đặt lại mật khẩu</title>
</head>

<body
  style="
    margin:0;
    padding:0;
    background:#f4f5f7;
    font-family:Arial, Helvetica, sans-serif;
  "
>

  <div
    style="
      max-width:520px;
      margin:40px auto;
      background:#17181f;
      color:#ffffff;
      padding:32px;
      border-radius:16px;
    "
  >

    <h2
      style="
        color:#ff4d4f;
        margin:0 0 20px 0;
      "
    >
      MangaNest
    </h2>

    <p>
      Xin chào
      <strong>${username || "bạn"}</strong>,
    </p>

    <p style="line-height:1.6;">
      Chúng tôi nhận được yêu cầu đặt lại mật khẩu
      cho tài khoản MangaNest của bạn.
    </p>

    <p style="line-height:1.6;">
      Nhấn vào nút bên dưới để đặt mật khẩu mới:
    </p>

    <div
      style="
        text-align:center;
        margin:30px 0;
      "
    >

      <a
        href="${resetUrl}"
        style="
          display:inline-block;
          background:#ff4d4f;
          color:#ffffff;
          padding:13px 28px;
          border-radius:10px;
          text-decoration:none;
          font-weight:bold;
        "
      >
        Đặt lại mật khẩu
      </a>

    </div>

    <p>
      Nếu nút phía trên không hoạt động,
      bạn có thể copy đường dẫn sau vào trình duyệt:
    </p>

    <p
      style="
        word-break:break-all;
        color:#9aa0ac;
        font-size:13px;
      "
    >
      ${resetUrl}
    </p>

    <p
      style="
        color:#9aa0ac;
        font-size:13px;
        line-height:1.6;
        margin-top:25px;
      "
    >
      Link đặt lại mật khẩu sẽ hết hạn sau
      <strong>15 phút</strong>.
    </p>

    <p
      style="
        color:#9aa0ac;
        font-size:13px;
        line-height:1.6;
      "
    >
      Nếu bạn không yêu cầu đặt lại mật khẩu,
      vui lòng bỏ qua email này.
    </p>

    <hr
      style="
        border:0;
        border-top:1px solid #2b2d35;
        margin:25px 0;
      "
    >

    <p
      style="
        color:#777b86;
        font-size:12px;
        text-align:center;
      "
    >
      © MangaNest
    </p>

  </div>

</body>

</html>
    `,
  };

  await transporter.sendMail(mailOptions);
};

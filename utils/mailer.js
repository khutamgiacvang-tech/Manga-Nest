const nodemailer = require("nodemailer");

// =====================
// Tạo SMTP Transporter
// =====================
const transporter = nodemailer.createTransport({
  host: process.env.EMAIL_HOST || "smtp.gmail.com",

  port: Number(process.env.EMAIL_PORT) || 465,

  // Port 465 dùng SSL
  secure: Number(process.env.EMAIL_PORT || 465) === 465,

  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },

  // Timeout để tránh chờ quá lâu nếu SMTP có vấn đề
  connectionTimeout: 15000,
  greetingTimeout: 15000,
  socketTimeout: 20000,
});

// =====================
// Gửi mail reset mật khẩu
// =====================
exports.sendResetPasswordEmail = async ({ to, username, resetUrl }) => {
  const mailOptions = {
    // Người gửi
    from: process.env.EMAIL_FROM || `MangaNest <${process.env.EMAIL_USER}>`,

    // Người nhận
    to,

    // Nếu người nhận bấm Reply thì gửi về Gmail này
    replyTo: process.env.EMAIL_USER,

    // Tiêu đề
    subject: "MangaNest - Yêu cầu đặt lại mật khẩu",

    // Nội dung HTML
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
    margin: 0;
    padding: 0;
    background: #f4f5f7;
    font-family: Arial, Helvetica, sans-serif;
  "
>

  <div
    style="
      max-width: 520px;
      margin: 40px auto;
      background: #17181f;
      color: #ffffff;
      padding: 32px;
      border-radius: 16px;
    "
  >

    <!-- Logo -->
    <h2
      style="
        color: #ff4d4f;
        margin: 0 0 20px 0;
      "
    >
      MangaNest
    </h2>

    <!-- Xin chào -->
    <p>
      Xin chào
      <strong>${username || "bạn"}</strong>,
    </p>

    <!-- Nội dung -->
    <p style="line-height: 1.6;">
      Chúng tôi nhận được yêu cầu đặt lại mật khẩu
      cho tài khoản MangaNest của bạn.
    </p>

    <p style="line-height: 1.6;">
      Nhấn vào nút bên dưới để đặt mật khẩu mới:
    </p>

    <!-- Button -->
    <div
      style="
        text-align: center;
        margin: 30px 0;
      "
    >

      <a
        href="${resetUrl}"
        style="
          display: inline-block;
          background: #ff4d4f;
          color: #ffffff;
          padding: 13px 28px;
          border-radius: 10px;
          text-decoration: none;
          font-weight: bold;
        "
      >
        Đặt lại mật khẩu
      </a>

    </div>

    <!-- Link dự phòng -->
    <p>
      Nếu nút phía trên không hoạt động,
      bạn có thể copy đường dẫn sau vào trình duyệt:
    </p>

    <p
      style="
        word-break: break-all;
        color: #9aa0ac;
        font-size: 13px;
        line-height: 1.5;
      "
    >
      ${resetUrl}
    </p>

    <!-- Thời hạn -->
    <p
      style="
        color: #9aa0ac;
        font-size: 13px;
        line-height: 1.6;
        margin-top: 25px;
      "
    >
      Link đặt lại mật khẩu sẽ hết hạn sau
      <strong>15 phút</strong>.
    </p>

    <p
      style="
        color: #9aa0ac;
        font-size: 13px;
        line-height: 1.6;
      "
    >
      Nếu bạn không yêu cầu đặt lại mật khẩu,
      vui lòng bỏ qua email này.
      Tài khoản của bạn vẫn an toàn.
    </p>

    <!-- Footer -->
    <hr
      style="
        border: 0;
        border-top: 1px solid #2b2d35;
        margin: 25px 0;
      "
    >

    <p
      style="
        color: #777b86;
        font-size: 12px;
        text-align: center;
        margin: 0;
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

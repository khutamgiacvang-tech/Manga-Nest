// =====================
// MangaNest Mailer
// Gửi mail qua Resend API
// Không dùng Gmail SMTP
// =====================

const RESEND_API_URL = "https://api.resend.com/emails";

// =====================
// Gửi email qua Resend
// =====================

async function sendViaResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Thiếu RESEND_API_KEY trong Environment Variables của Render.",
    );
  }

  const from = process.env.EMAIL_FROM || "MangaNest <no-reply@manganest.site>";

  const response = await fetch(RESEND_API_URL, {
    method: "POST",

    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },

    body: JSON.stringify({
      from,
      to: [to],
      subject,
      html,
    }),
  });

  if (!response.ok) {
    const errorText = await response.text().catch(() => "");

    throw new Error(`Resend API lỗi (status ${response.status}): ${errorText}`);
  }

  return response.json();
}

// =====================
// Gửi mail reset mật khẩu
// =====================

exports.sendResetPasswordEmail = async ({ to, username, resetUrl }) => {
  const subject = "MangaNest - Yêu cầu đặt lại mật khẩu";

  const html = `
<!DOCTYPE html>
<html lang="vi">

<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

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

    <!-- Logo / tên website -->

    <h2
      style="
        color:#ff4d4f;
        margin:0 0 20px 0;
      "
    >
      MangaNest
    </h2>


    <!-- Lời chào -->

    <p>
      Xin chào
      <strong>${username || "bạn"}</strong>,
    </p>


    <!-- Nội dung -->

    <p style="line-height:1.6;">
      Chúng tôi nhận được yêu cầu đặt lại mật khẩu
      cho tài khoản MangaNest của bạn.
    </p>

    <p style="line-height:1.6;">
      Nhấn vào nút bên dưới để đặt mật khẩu mới:
    </p>


    <!-- Button -->

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


    <!-- Fallback link -->

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


    <!-- Expiration -->

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


    <!-- Security notice -->

    <p
      style="
        color:#9aa0ac;
        font-size:13px;
        line-height:1.6;
      "
    >
      Nếu bạn không yêu cầu đặt lại mật khẩu,
      vui lòng bỏ qua email này.
      Tài khoản của bạn vẫn an toàn.
    </p>


    <!-- Divider -->

    <hr
      style="
        border:0;
        border-top:1px solid #2b2d35;
        margin:25px 0;
      "
    >


    <!-- Footer -->

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
  `;

  return await sendViaResend({
    to,
    subject,
    html,
  });
};

// =====================
// Gửi mail xác minh tài khoản (đăng ký)
// =====================

exports.sendVerifyEmail = async ({ to, username, verifyUrl }) => {
  const subject = "MangaNest - Xác minh địa chỉ Gmail của bạn";

  const html = `
<!DOCTYPE html>
<html lang="vi">

<head>
  <meta charset="UTF-8">
  <meta
    name="viewport"
    content="width=device-width, initial-scale=1.0"
  >

  <title>MangaNest - Xác minh tài khoản</title>
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
      Cảm ơn bạn đã đăng ký tài khoản tại MangaNest. Để hoàn tất
      đăng ký và có thể đăng nhập, vui lòng xác minh địa chỉ Gmail
      này là của bạn bằng cách nhấn nút bên dưới:
    </p>

    <div
      style="
        text-align:center;
        margin:30px 0;
      "
    >

      <a
        href="${verifyUrl}"
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
        Xác minh Gmail của tôi
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
      ${verifyUrl}
    </p>

    <p
      style="
        color:#9aa0ac;
        font-size:13px;
        line-height:1.6;
        margin-top:25px;
      "
    >
      Link xác minh sẽ hết hạn sau
      <strong>24 giờ</strong>.
    </p>

    <p
      style="
        color:#9aa0ac;
        font-size:13px;
        line-height:1.6;
      "
    >
      Nếu bạn không tạo tài khoản này, vui lòng bỏ qua email này.
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
  `;

  return await sendViaResend({
    to,
    subject,
    html,
  });
};

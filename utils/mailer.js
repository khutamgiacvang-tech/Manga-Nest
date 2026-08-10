// =====================
// Gửi mail qua Resend API (HTTP, không dùng SMTP)
// =====================
// Lý do đổi từ Nodemailer/SMTP sang Resend:
// Render free tier chặn outbound traffic tới port SMTP (25, 465, 587)
// từ 26/9/2025, nên Nodemailer luôn bị "Connection timeout" (ETIMEDOUT)
// trên môi trường free. Resend gửi qua HTTPS (port 443) nên không bị chặn.
//
// Cấu hình qua .env / Render Environment:
//   RESEND_API_KEY=re_xxxxxxxxxxxx   (lấy tại https://resend.com/api-keys)
//   EMAIL_FROM="MangaNest <onboarding@resend.dev>"
//     - Nếu CHƯA verify domain riêng trên Resend: bắt buộc dùng
//       "onboarding@resend.dev" làm địa chỉ gửi (Resend chỉ cho gửi tới
//       chính email bạn đăng ký tài khoản Resend khi dùng domain test này).
//     - Nếu ĐÃ verify domain riêng (vd manganest.net) trên Resend:
//       có thể dùng EMAIL_FROM="MangaNest <no-reply@manganest.net>"
//       và gửi được tới bất kỳ ai.
const RESEND_API_URL = "https://api.resend.com/emails";

async function sendViaResend({ to, subject, html }) {
  const apiKey = process.env.RESEND_API_KEY;

  if (!apiKey) {
    throw new Error(
      "Thiếu RESEND_API_KEY trong biến môi trường. Vào https://resend.com/api-keys để tạo key."
    );
  }

  const res = await fetch(RESEND_API_URL, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey}`,
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      from: process.env.EMAIL_FROM || "MangaNest <onboarding@resend.dev>",
      to: [to],
      subject,
      html,
    }),
  });

  if (!res.ok) {
    const errText = await res.text().catch(() => "");
    throw new Error(`Resend API lỗi (status ${res.status}): ${errText}`);
  }

  return res.json();
}

// =====================
// Gửi mail reset mật khẩu
// =====================
exports.sendResetPasswordEmail = async ({ to, username, resetUrl }) => {
  const subject = "MangaNest - Yêu cầu đặt lại mật khẩu";
  const html = `
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
    `;

  await sendViaResend({ to, subject, html });
};

const { Resend } = require("resend");

// =====================
// RESEND
// =====================

const resend = new Resend(process.env.RESEND_API_KEY);

// =====================
// GỬI MAIL RESET MẬT KHẨU
// =====================

exports.sendResetPasswordEmail = async ({ to, username, resetUrl }) => {
  try {
    const { data, error } = await resend.emails.send({
      from: "MangaNest <onboarding@resend.dev>",
      to: [to],
      subject: "MangaNest - Yêu cầu đặt lại mật khẩu",

      html: `
        <div style="
          font-family: Arial, sans-serif;
          max-width: 520px;
          margin: 0 auto;
          background: #17181f;
          color: #ffffff;
          padding: 32px;
          border-radius: 16px;
        ">

          <h2 style="
            color: #ff4d4f;
            margin-bottom: 8px;
          ">
            MangaNest
          </h2>

          <p>
            Xin chào <strong>${username || "bạn"}</strong>,
          </p>

          <p>
            Chúng tôi nhận được yêu cầu đặt lại mật khẩu
            cho tài khoản MangaNest gắn với email này.
            Nhấn vào nút bên dưới để đặt mật khẩu mới:
          </p>

          <p style="
            text-align: center;
            margin: 28px 0;
          ">
            <a
              href="${resetUrl}"
              style="
                background: #ff4d4f;
                color: #ffffff;
                padding: 12px 28px;
                border-radius: 10px;
                text-decoration: none;
                font-weight: bold;
                display: inline-block;
              "
            >
              Đặt lại mật khẩu
            </a>
          </p>

          <p>
            Hoặc copy link sau vào trình duyệt:
          </p>

          <p style="
            word-break: break-all;
            color: #9aa0ac;
          ">
            ${resetUrl}
          </p>

          <p style="
            color: #9aa0ac;
            font-size: 13px;
            margin-top: 24px;
          ">
            Link này sẽ hết hạn sau 15 phút.
            Nếu bạn không yêu cầu đặt lại mật khẩu,
            vui lòng bỏ qua email này,
            tài khoản của bạn vẫn an toàn.
          </p>

        </div>
      `,
    });

    // =====================
    // KIỂM TRA LỖI RESEND
    // =====================

    if (error) {
      console.error("SEND MAIL ERROR:", error);

      throw new Error(error.message || "Không thể gửi email đặt lại mật khẩu.");
    }

    // =====================
    // GỬI THÀNH CÔNG
    // =====================

    console.log("RESET EMAIL SENT:", data?.id);

    return data;
  } catch (err) {
    console.error("SEND MAIL ERROR:", err);

    throw err;
  }
};

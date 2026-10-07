const User = require("../models/User");

/**
 * Gửi Expo Push Notification tới các token của một user.
 * Không throw để việc upload chapter không thất bại chỉ vì push lỗi.
 */
async function sendExpoPushNotification(userId, tokens, payload) {
  const validTokens = Array.isArray(tokens)
    ? tokens.filter((token) => typeof token === "string" && token.trim())
    : [];

  if (!validTokens.length) return;

  try {
    const messages = validTokens.map((to) => ({
      to,
      sound: "default",
      title: payload.title,
      body: payload.body,
      data: payload.data || {},
      channelId: "default",
    }));

    const response = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Accept-encoding": "gzip, deflate",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });

    if (!response.ok) {
      const text = await response.text();
      console.error(`[expo-push] HTTP ${response.status}: ${text}`);
      return;
    }

    const result = await response.json();
    const tickets = result?.data || [];
    const deadTokens = [];

    tickets.forEach((ticket, index) => {
      if (ticket?.status === "error") {
        const details = ticket.details || {};
        if (
          details.error === "DeviceNotRegistered" ||
          details.error === "InvalidCredentials"
        ) {
          deadTokens.push(validTokens[index]);
        } else {
          console.error(
            `[expo-push] User ${userId} token lỗi:`,
            ticket.message || details.error || "Unknown error",
          );
        }
      }
    });

    if (deadTokens.length) {
      await User.findByIdAndUpdate(userId, {
        $pull: { expoPushTokens: { $in: deadTokens } },
      });
    }
  } catch (err) {
    console.error(`[expo-push] Không gửi được push tới user ${userId}:`, err.message);
  }
}

module.exports = sendExpoPushNotification;

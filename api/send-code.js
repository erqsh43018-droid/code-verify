const nodemailer = require("nodemailer");
const crypto = require("crypto");

async function redis(command, args = []) {
  const base = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!base || !token) {
    throw new Error("Redis environment variables are missing");
  }

  const url =
    base.replace(/\/$/, "") +
    "/" +
    command +
    "/" +
    args.map(v => encodeURIComponent(v)).join("/");

  const response = await fetch(url, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Redis request failed");
  }

  return response.json();
}

function validEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email);
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
  }

  try {
    const { email } = req.body || {};
    const cleanEmail = String(email || "").trim().toLowerCase();

    if (!validEmail(cleanEmail)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_email"
      });
    }

    const cooldownKey = `otp_cooldown:${cleanEmail}`;

    const cooldown = await redis("get", [cooldownKey]);

    if (cooldown.result) {
      return res.status(429).json({
        ok: false,
        error: "cooldown"
      });
    }

    const otp = crypto.randomInt(10000, 100000).toString();

    const otpKey = `otp:${cleanEmail}`;

    await redis("setex", [
      otpKey,
      "60",
      JSON.stringify({
        code: otp,
        attempts: 0
      })
    ]);

    await redis("setex", [
      cooldownKey,
      "30",
      "1"
    ]);

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: process.env.GMAIL_USER,
        pass: process.env.GMAIL_APP_PASSWORD
      }
    });

    await transporter.sendMail({
      from: `"CODE VERIFY" <${process.env.GMAIL_USER}>`,
      to: cleanEmail,
      subject: "Your CODE VERIFY verification code",

      text:
        `Your CODE VERIFY verification code is ${otp}.\n\n` +
        `This code expires in 60 seconds.\n` +
        `If you did not request this code, you can ignore this email.`,

      html: `
        <div style="font-family:Arial,sans-serif;background:#f4f7fb;padding:30px">
          <div style="
            max-width:480px;
            margin:auto;
            background:#ffffff;
            border-radius:18px;
            padding:28px;
            text-align:center;
          ">
            <h2 style="margin:0 0 10px">CODE VERIFY</h2>

            <p style="color:#666">
              Your verification code is:
            </p>

            <div style="
              font-size:34px;
              font-weight:700;
              letter-spacing:8px;
              margin:22px 0;
            ">
              ${otp}
            </div>

            <p style="color:#777;font-size:14px">
              This code expires in 60 seconds.
            </p>

            <p style="color:#999;font-size:12px">
              If you did not request this code, you can ignore this email.
            </p>
          </div>
        </div>
      `
    });

    return res.status(200).json({
      ok: true,
      expiresIn: 60
    });

  } catch (error) {
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "server_error"
    });
  }
};

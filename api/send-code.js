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
    method: "GET",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json"
    }
  });

  const text = await response.text();

  if (!response.ok) {
    console.error("Redis error:", response.status, text);
    throw new Error("Redis request failed");
  }

  return JSON.parse(text);
}

function escapeHtml(value) {
  return String(value)
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
  }

  try {
    const body = req.body || {};
    const email = String(body.email || "").trim().toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_email",
        message: "Please enter a valid email address."
      });
    }

    const cooldownKey = `otp_cooldown:${email}`;
    const cooldownCheck = await redis("get", [cooldownKey]);

    if (cooldownCheck && cooldownCheck.result) {
      return res.status(429).json({
        ok: false,
        error: "cooldown",
        message: "Please wait before requesting another code."
      });
    }

    const code = String(crypto.randomInt(10000, 100000));
    const otpKey = `otp:${email}`;

    await redis("setex", [
      otpKey,
      "60",
      JSON.stringify({
        code,
        attempts: 0
      })
    ]);

    await redis("setex", [cooldownKey, "30", "1"]);

    const gmailUser = process.env.GMAIL_USER;
    const gmailPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPassword) {
      throw new Error("Gmail environment variables are missing");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPassword
      }
    });

    const safeEmail = escapeHtml(email);

    await transporter.sendMail({
      from: `"CODE VERIFY" <${gmailUser}>`,
      to: email,
      subject: `${code} is your CODE VERIFY verification code`,

      text:
`CODE VERIFY

Your verification code is: ${code}

This code expires in 60 seconds.

If you did not request this code, you can safely ignore this email.

CODE VERIFY • Verification Demo
Developed By Eresh Devx`,

      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width,initial-scale=1.0">
<title>CODE VERIFY</title>
</head>

<body style="margin:0;padding:0;background:#07111f;font-family:Arial,Helvetica,sans-serif;color:#eef5ff;">

  <div style="padding:34px 14px;background:#07111f;">

    <div style="
      max-width:520px;
      margin:0 auto;
      background:#101d31;
      border:1px solid #263956;
      border-radius:24px;
      overflow:hidden;
    ">

      <div style="
        padding:28px 26px 22px;
        text-align:center;
        background:linear-gradient(145deg,#14294b,#0c1728);
      ">

        <div style="
          display:inline-block;
          width:48px;
          height:48px;
          line-height:48px;
          border-radius:15px;
          background:linear-gradient(145deg,#2477ff,#6aa8ff);
          color:#fff;
          font-size:24px;
          font-weight:800;
        ">
          ✓
        </div>

        <div style="
          margin-top:14px;
          color:#fff;
          font-size:22px;
          font-weight:800;
          letter-spacing:-.5px;
        ">
          CODE VERIFY
        </div>

        <div style="
          margin-top:5px;
          color:#8fa1bb;
          font-size:12px;
        ">
          Secure email verification
        </div>

      </div>

      <div style="padding:30px 26px;">

        <div style="
          text-align:center;
          color:#a9b8cc;
          font-size:13px;
          line-height:1.7;
        ">
          Use the verification code below to continue.
        </div>

        <div style="margin:24px 0;text-align:center;">

          <div style="
            display:inline-block;
            padding:18px 25px;
            border:1px solid #28518a;
            border-radius:18px;
            background:#0b192c;
            color:#4c91ff;
            font-size:34px;
            font-weight:800;
            letter-spacing:8px;
            line-height:1;
          ">
            ${code}
          </div>

        </div>

        <div style="
          text-align:center;
          color:#71809a;
          font-size:12px;
          line-height:1.7;
        ">
          This code expires in
          <strong style="color:#19b978;">
            60 seconds
          </strong>.
        </div>

        <div style="
          height:1px;
          background:#203149;
          margin:25px 0;
        "></div>

        <div style="
          color:#8fa1bb;
          font-size:12px;
          line-height:1.7;
        ">
          This verification code was requested for:
          <strong style="color:#eef5ff;">
            ${safeEmail}
          </strong>
        </div>

        <div style="
          margin-top:18px;
          padding:13px 14px;
          border-radius:13px;
          background:#0b1727;
          border:1px solid #1d304a;
          color:#71809a;
          font-size:11px;
          line-height:1.6;
        ">
          If you did not request this code, you can safely ignore this email.
        </div>

      </div>

      <div style="
        padding:18px 24px;
        text-align:center;
        border-top:1px solid #203149;
        color:#71809a;
        font-size:10px;
      ">
        CODE VERIFY • Verification Demo<br>

        <strong style="color:#dce7f5;">
          Developed By Eresh Devx
        </strong>
      </div>

    </div>

  </div>

</body>
</html>`
    });

    return res.status(200).json({
      ok: true,
      expiresIn: 60
    });

  } catch (error) {

    console.error("SEND ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "server_error",
      message: "Unable to send verification code."
    });

  }
};
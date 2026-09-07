const nodemailer = require("nodemailer");
const crypto = require("crypto");

const json = (res, status, data) => {
  res.status(status).json(data);
};

function randomOTP() {
  return crypto.randomInt(10000, 100000).toString();
}

async function redis(command, args = []) {
  const url = process.env.UPSTASH_REDIS_REST_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN;

  if (!url || !token) {
    throw new Error("Redis environment variables are missing.");
  }

  const response = await fetch(`${url}/${command}/${args.map(encodeURIComponent).join("/")}`, {
    headers: {
      Authorization: `Bearer ${token}`
    }
  });

  if (!response.ok) {
    throw new Error("Redis request failed.");
  }

  return response.json();
}

module.exports = async function handler(req, res) {
  if (req.method !== "POST") {
    return json(res, 405, {
      ok: false,
      message: "Method not allowed."
    });
  }

  try {
    const email = String(req.body?.email || "")
      .trim()
      .toLowerCase();

    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return json(res, 400, {
        ok: false,
        message: "Please enter a valid email address."
      });
    }

    const cooldownKey = `otp_cooldown:${email}`;

    const cooldown = await redis("GET", [cooldownKey]);

    if (cooldown.result) {
      return json(res, 429, {
        ok: false,
        message: "Please wait before requesting another code."
      });
    }

    const otp = randomOTP();

    const otpData = JSON.stringify({
      code: otp,
      attempts: 0
    });

    await redis("SETEX", [`otp:${email}`, "60", otpData]);
    await redis("SETEX", [cooldownKey, "30", "1"]);

    const user = process.env.GMAIL_USER;
    const pass = process.env.GMAIL_APP_PASSWORD;

    if (!user || !pass) {
      throw new Error("Gmail environment variables are missing.");
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user,
        pass
      }
    });

    await transporter.sendMail({
      from: `"CODE VERIFY" <${user}>`,
      to: email,
      subject: "Your CODE VERIFY verification code",
      text:
`Your CODE VERIFY verification code is ${otp}.

This code expires in 60 seconds.

If you did not request this code, you can safely ignore this email.`,

      html: `
<!DOCTYPE html>
<html>
<head>
<meta charset="UTF-8">
<meta name="viewport" content="width=device-width">
</head>

<body style="margin:0;background:#eef4ff;font-family:Arial,sans-serif;">
  <div style="max-width:520px;margin:40px auto;padding:20px;">
    <div style="
      background:#ffffff;
      border-radius:24px;
      padding:34px 28px;
      text-align:center;
      box-shadow:0 15px 50px rgba(30,70,130,.12);
    ">

      <div style="
        display:inline-flex;
        width:58px;
        height:58px;
        align-items:center;
        justify-content:center;
        border-radius:18px;
        background:#eaf2ff;
        color:#1769ff;
        font-size:24px;
        font-weight:800;
      ">CV</div>

      <h2 style="margin:22px 0 8px;color:#12213d;">
        Verify your email
      </h2>

      <p style="margin:0;color:#71809a;font-size:14px;">
        Use the verification code below to continue.
      </p>

      <div style="
        margin:26px 0;
        padding:18px;
        border-radius:16px;
        background:#f3f7ff;
        color:#1769ff;
        font-size:34px;
        font-weight:800;
        letter-spacing:9px;
      ">${otp}</div>

      <p style="margin:0;color:#7d8aa0;font-size:13px;">
        This code expires in 60 seconds.
      </p>

      <div style="
        margin-top:26px;
        padding-top:18px;
        border-top:1px solid #edf1f7;
        color:#a0a9b8;
        font-size:11px;
      ">
        CODE VERIFY • Verification Demo
      </div>

    </div>
  </div>
</body>
</html>`
    });

    return json(res, 200, {
      ok: true,
      expiresIn: 60
    });

  } catch (error) {
    console.error(error);

    return json(res, 500, {
      ok: false,
      message: "Unable to send verification code."
    });
  }
};
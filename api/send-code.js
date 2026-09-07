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

module.exports = async (req, res) => {

  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
  }

  try {

    const body = req.body || {};

    const email = String(body.email || "")
      .trim()
      .toLowerCase();

    if (!email || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_email"
      });
    }

    const key = `otp:${email}`;

    const existing = await redis("get", [key]);

    if (existing && existing.result) {
      return res.status(429).json({
        ok: false,
        error: "cooldown"
      });
    }

    const code = String(
      crypto.randomInt(10000, 100000)
    );

    await redis("setex", [
      key,
      "60",
      JSON.stringify({
        code: code,
        attempts: 0
      })
    ]);

    const gmailUser = process.env.GMAIL_USER;
    const gmailPassword = process.env.GMAIL_APP_PASSWORD;

    if (!gmailUser || !gmailPassword) {
      throw new Error(
        "Gmail environment variables are missing"
      );
    }

    const transporter = nodemailer.createTransport({
      service: "gmail",
      auth: {
        user: gmailUser,
        pass: gmailPassword
      }
    });

    await transporter.sendMail({

      from: `"ERESH DEVX OTP" <${gmailUser}>`,

      to: email,

      subject:
        `${code} is your CODE VERIFY verification code`,

      text:
`CODE VERIFY

Your verification code is:

${code}

This code expires in 60 seconds.

If you did not request this code, you can safely ignore this email.

CODE VERIFY
Developed By Eresh Devx`,

      html: `
<!DOCTYPE html>
<html>

<head>

<meta charset="UTF-8">

<meta
  name="viewport"
  content="width=device-width, initial-scale=1.0"
>

<title>CODE VERIFY</title>

</head>

<body
  style="
    margin:0;
    padding:0;
    background:#070b12;
    font-family:Arial,Helvetica,sans-serif;
  "
>

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  style="
    background:#070b12;
    padding:35px 12px;
  "
>

<tr>

<td align="center">

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  style="
    max-width:500px;
    background:#101722;
    border:1px solid #243143;
    border-radius:22px;
    overflow:hidden;
  "
>

<!-- HEADER -->

<tr>

<td
  align="center"
  style="
    padding:30px 20px 25px;
    background:#111c2b;
    border-bottom:1px solid #233246;
  "
>

<div
  style="
    width:52px;
    height:52px;
    line-height:52px;
    border-radius:16px;
    background:#1769ff;
    color:#ffffff;
    font-size:25px;
    font-weight:bold;
    margin:auto;
  "
>
✓
</div>

<div
  style="
    margin-top:14px;
    color:#ffffff;
    font-size:22px;
    font-weight:bold;
    letter-spacing:.5px;
  "
>
CODE VERIFY
</div>

<div
  style="
    margin-top:6px;
    color:#8798ad;
    font-size:12px;
  "
>
Secure verification
</div>

</td>

</tr>


<!-- CONTENT -->

<tr>

<td
  style="
    padding:30px 24px;
  "
>

<div
  style="
    color:#aab8ca;
    font-size:14px;
    line-height:22px;
    text-align:center;
  "
>
Your verification code is ready.
</div>


<!-- CODE -->

<table
  width="100%"
  cellpadding="0"
  cellspacing="0"
  border="0"
  style="
    margin-top:25px;
  "
>

<tr>

<td align="center">

<div
  style="
    display:inline-block;
    padding:18px 25px;
    background:#0a1422;
    border:1px solid #28528d;
    border-radius:17px;
    color:#4c91ff;
    font-size:34px;
    font-weight:bold;
    letter-spacing:8px;
  "
>
${code}
</div>

</td>

</tr>

</table>


<!-- EXPIRY -->

<div
  style="
    margin-top:20px;
    text-align:center;
    color:#78899f;
    font-size:12px;
  "
>
This code expires in
<strong style="color:#19b978;">
60 seconds
</strong>
</div>


<!-- DIVIDER -->

<div
  style="
    height:1px;
    background:#223044;
    margin:25px 0;
  "
></div>


<!-- INFO -->

<div
  style="
    color:#8191a6;
    font-size:12px;
    line-height:20px;
  "
>

This verification code was requested for:

<br>

<strong
  style="
    color:#e7edf6;
    word-break:break-all;
  "
>
${email}
</strong>

</div>


<!-- WARNING -->

<div
  style="
    margin-top:18px;
    padding:13px 14px;
    background:#0b131f;
    border:1px solid #1c2b3e;
    border-radius:12px;
    color:#718197;
    font-size:11px;
    line-height:18px;
  "
>

If you did not request this verification code,
you can safely ignore this email.

</div>

</td>

</tr>


<!-- FOOTER -->

<tr>

<td
  align="center"
  style="
    padding:18px 20px;
    border-top:1px solid #223044;
    color:#64758b;
    font-size:10px;
    line-height:17px;
  "
>

CODE VERIFY

<br>

<strong style="color:#aebdd0;">
Developed By Eresh Devx
</strong>

</td>

</tr>

</table>

</td>

</tr>

</table>

</body>

</html>
`
    });

    return res.status(200).json({
      ok: true
    });

  } catch (error) {

    console.error("SEND ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "server_error"
    });

  }
};

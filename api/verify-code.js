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

    const code = String(body.code || "").trim();

    if (!email || !/^\d{5}$/.test(code)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_input"
      });
    }

    const key = `otp:${email}`;

    const result = await redis("get", [key]);

    if (!result || !result.result) {
      return res.status(400).json({
        ok: false,
        error: "expired"
      });
    }

    let data;

    try {
      data = JSON.parse(result.result);
    } catch (e) {
      await redis("del", [key]);

      return res.status(400).json({
        ok: false,
        error: "expired"
      });
    }

    if (data.attempts >= 5) {
      await redis("del", [key]);

      return res.status(429).json({
        ok: false,
        error: "too_many_attempts"
      });
    }

    if (String(data.code) !== code) {
      data.attempts = Number(data.attempts || 0) + 1;

      await redis("setex", [
        key,
        "60",
        JSON.stringify(data)
      ]);

      return res.status(400).json({
        ok: false,
        error: "wrong"
      });
    }

    await redis("del", [key]);

    return res.status(200).json({
      ok: true
    });

  } catch (error) {
    console.error("VERIFY ERROR:", error);

    return res.status(500).json({
      ok: false,
      error: "server_error"
    });
  }
};

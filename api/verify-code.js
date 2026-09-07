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

module.exports = async (req, res) => {
  if (req.method !== "POST") {
    return res.status(405).json({
      ok: false,
      error: "method_not_allowed"
    });
  }

  try {
    const { email, code } = req.body || {};

    const cleanEmail = String(email || "").trim().toLowerCase();
    const cleanCode = String(code || "").trim();

    if (!cleanEmail || !/^\d{5}$/.test(cleanCode)) {
      return res.status(400).json({
        ok: false,
        error: "invalid_input"
      });
    }

    const key = `otp:${cleanEmail}`;

    const result = await redis("get", [key]);

    if (!result.result) {
      return res.status(400).json({
        ok: false,
        error: "expired"
      });
    }

    let data;

    try {
      data = JSON.parse(result.result);
    } catch {
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

    if (cleanCode !== data.code) {
      data.attempts++;

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
    console.error(error);

    return res.status(500).json({
      ok: false,
      error: "server_error"
    });
  }
};      .toLowerCase();

    const code = String(req.body?.code || "").trim();

    if (!email || !/^\d{5}$/.test(code)) {
      return json(res, 400, {
        ok: false,
        error: "wrong"
      });
    }

    const key = `otp:${email}`;

    const stored = await redis("GET", [key]);

    if (!stored.result) {
      return json(res, 400, {
        ok: false,
        error: "expired"
      });
    }

    let data;

    try {
      data = JSON.parse(stored.result);
    } catch {
      await redis("DEL", [key]);

      return json(res, 400, {
        ok: false,
        error: "expired"
      });
    }

    if (data.attempts >= 5) {
      await redis("DEL", [key]);

      return json(res, 429, {
        ok: false,
        error: "too_many_attempts"
      });
    }

    if (code !== data.code) {
      data.attempts += 1;

      await redis("SETEX", [
        key,
        "60",
        JSON.stringify(data)
      ]);

      return json(res, 400, {
        ok: false,
        error: "wrong"
      });
    }

    await redis("DEL", [key]);

    return json(res, 200, {
      ok: true
    });

  } catch (error) {
    console.error(error);

    return json(res, 500, {
      ok: false,
      error: "server"
    });
  }
};

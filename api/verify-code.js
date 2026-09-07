const json = (res, status, data) => {
  res.status(status).json(data);
};

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

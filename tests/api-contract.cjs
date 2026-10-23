const { test } = require("node:test");
const assert = require("node:assert/strict");
const { createServer } = require("node:http");

test("live API validates responses and never substitutes demo data on errors", async () => {
  let status = 200;
  let payload;
  let endpoint;
  let requestBody;
  const server = createServer((req, res) => {
    endpoint = req.url;
    let body = "";
    req.on("data", (chunk) => (body += chunk));
    req.on("end", () => {
      requestBody = body ? JSON.parse(body) : undefined;
      res.writeHead(status, { "Content-Type": "application/json" });
      res.end(JSON.stringify(payload));
    });
  });
  await new Promise((resolve) => server.listen(0, "127.0.0.1", resolve));
  process.env.NEXT_PUBLIC_DEMO_MODE = "false";
  process.env.NEXT_PUBLIC_API_URL = `http://127.0.0.1:${server.address().port}`;
  const api = require("../.api-check/api.js");
  const input = { mode: "message", content: "Please review this message" };
  const backendResponse = {
    risk_score: 86,
    risk_level: "critical",
    category: "otp_theft",
    summary: "Several indicators need independent verification.",
    signals: [
      {
        title: "OTP disclosure request",
        explanation: "Never disclose a one-time password.",
        evidence: ["Share the OTP", "immediately"],
      },
    ],
    recommended_actions: [{ priority: 1, action: "Do not share the code." }],
    limitations: { notes: ["This does not verify the sender."] },
  };
  try {
    payload = { service: "scamurai-backend", status: "ok" };
    assert.equal(await api.health(), true);
    assert.equal(endpoint, "/health");
    payload = { status: "ok" };
    assert.equal(await api.health(), false);
    status = 503;
    assert.equal(await api.health(), false);
    status = 200;
    payload = { service: "scamurai-backend", status: "ok" };
    assert.equal(await api.health(), true);
    payload = backendResponse;
    const result = await api.analyze(input);
    assert.equal(result.demo, false);
    assert.equal(endpoint, "/api/v1/analyze");
    assert.deepEqual(requestBody, {
      type: "text",
      content: input.content,
      language: "en",
    });
    assert.equal(result.level, "HIGH");
    assert.equal(result.category, "Otp Theft");
    assert.deepEqual(result.signals[0].evidence, [
      "Share the OTP",
      "immediately",
    ]);
    assert.deepEqual(result.actions, ["Do not share the code."]);
    payload = { ...backendResponse, risk_score: 150 };
    await assert.rejects(api.analyze(input), /unsupported response/);
    status = 503;
    await assert.rejects(api.analyze(input), /503/);
    status = 200;
    await assert.rejects(
      api.analyze({ mode: "crypto", content: "0x12345678" }),
      /not available yet/,
    );
    await assert.rejects(
      api.compareIntent({ mode: "crypto", content: "0x12345678" }),
      /not available yet/,
    );
    await assert.rejects(api.rescue("money"), /not available yet/);
  } finally {
    await new Promise((resolve) => server.close(resolve));
  }
  await assert.rejects(api.analyze(input), /Cannot reach/);
});

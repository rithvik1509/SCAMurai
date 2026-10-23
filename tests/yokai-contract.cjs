const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.NEXT_PUBLIC_YOKAI_API_ENABLED = "true";
process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
const api = require("../.yokai-check/yokai/api.js");
const {
  createDemoInvestigation,
} = require("../.yokai-check/yokai/fixtures.js");
const input = {
  targetUrl: "https://ignored.test",
  profiles: ["desktop", "mobile"],
  authorizationConfirmed: true,
  settings: {
    timeoutSeconds: 30,
    captureScreenshots: true,
    includeNetwork: true,
  },
};
test("live review metadata survives validation without changing legacy fixtures", () => {
  const fixture = createDemoInvestigation("payment", input);
  fixture.result.findings[0].severity = "high";
  fixture.result.findings[0].confidence =
    "Observed form structure only; intent is unknown.";
  fixture.result.captures[0].structure.textBlocks = ["Simulated deposit; no real payments"];
  fixture.result.captures[0].structure.actionLabels = ["Continue demo"];
  const result = api.validateInvestigation(fixture).result;
  assert.equal(result.findings[0].severity, "high");
  assert.match(result.findings[0].confidence, /intent is unknown/);
  assert.deepEqual(result.captures[0].structure.textBlocks, ["Simulated deposit; no real payments"]);
  assert.deepEqual(result.captures[0].structure.actionLabels, ["Continue demo"]);
});
test("three fixtures preserve distinct evidence and explicit valid relationships", () => {
  for (const scenario of ["responsive", "payment", "redirect"]) {
    const job = api.validateInvestigation(
      createDemoInvestigation(scenario, input),
    );
    assert.equal(job.demo, true);
    assert.equal(job.status, "completed");
    assert.equal(job.events.length, 1);
    assert.equal(job.result.captures.length, 2);
    const [desktop, mobile] = job.result.captures;
    assert.equal(desktop.forms.length, 0);
    assert.equal(mobile.forms.length, scenario === "payment" ? 1 : 0);
    assert.equal(mobile.redirects.length, scenario === "redirect" ? 1 : 0);
    if (scenario === "redirect")
      assert.notEqual(desktop.finalUrl, mobile.finalUrl);
    assert.equal(job.result.counterfactuals[0].conclusion, "controlled");
    assert.ok(
      job.result.captures.every((c) => c.screenshot.kind === "illustration"),
    );
    const ids = new Set(job.result.graph.nodes.map((n) => n.id));
    assert.ok(
      job.result.graph.edges.every(
        (e) => ids.has(e.source) && ids.has(e.target),
      ),
    );
  }
});
test("profile subsets do not imply a controlled viewport experiment", () => {
  for (const profiles of [
    ["desktop", "returning"],
    ["mobile", "returning"],
  ]) {
    const job = api.validateInvestigation(
      createDemoInvestigation("payment", { ...input, profiles }),
    );
    assert.equal(job.result.counterfactuals[0].conclusion, "inconclusive");
    assert.deepEqual(
      job.result.captures.map((c) => c.profileId),
      profiles,
    );
  }
});
test("reject malformed relationships, missing evidence, unsafe screenshots and fake live results", () => {
  for (const mutate of [
    (j) => (j.result.graph.edges[0].target = "invented"),
    (j) => (j.result.findings[0].evidenceIds = ["missing"]),
    (j) => j.result.graph.nodes.push(j.result.graph.nodes[0]),
    (j) =>
      (j.result.captures[0].screenshot.url =
        "https://untrusted.example/image.png"),
  ]) {
    const job = createDemoInvestigation("responsive", input);
    mutate(job);
    assert.throws(() => api.validateInvestigation(job), api.YokaiApiError);
  }
  assert.throws(
    () =>
      api.validateInvestigation(
        createDemoInvestigation("responsive", input),
        true,
      ),
    api.YokaiApiError,
  );
  assert.equal(api.safeExternalUrl("javascript:alert(1)"), undefined);
  assert.equal(
    api.safeExternalUrl("https://user:secret@example.com"),
    undefined,
  );
});
test("live client handles status, split evidence, HTTP failure and abort without fallback", async () => {
  const original = global.fetch;
  const calls = [];
  const fixture = createDemoInvestigation("redirect", input);
  const live = { ...fixture, id: "live-1", demo: false };
  live.result.captures.forEach((c) => (c.screenshot = null));
  const { result, ...snapshot } = live;
  global.fetch = async (url, options) => {
    calls.push([url, options]);
    return Response.json(
      String(url).endsWith("/evidence")
        ? result.captures
        : String(url).endsWith("/comparison")
          ? { ...result, captures: undefined }
          : snapshot,
    );
  };
  try {
    const job = await api.getInvestigation(
      "live-1",
      new AbortController().signal,
    );
    assert.equal(job.demo, false);
    assert.equal(job.result.captures.length, 2);
    assert.equal(calls.length, 3);
    global.fetch = async () => new Response("", { status: 403 });
    await assert.rejects(
      api.startInvestigation(input, new AbortController().signal),
      /not permitted/,
    );
    global.fetch = async () => Response.json({ ...snapshot, demo: true });
    await assert.rejects(
      api.getInvestigation("live-1", new AbortController().signal),
      /unsupported/,
    );
    global.fetch = async (_url, options) => {
      options.signal.throwIfAborted();
      throw Error("offline");
    };
    const controller = new AbortController();
    controller.abort();
    await assert.rejects(
      api.getInvestigation("live-1", controller.signal),
      (e) => e.name === "AbortError",
    );
    await assert.rejects(
      api.getInvestigation("live-1", new AbortController().signal),
      /connection/,
    );
  } finally {
    global.fetch = original;
  }
});
test("session history restores validated jobs and keeps the latest eight", () => {
  const items = new Map();
  global.sessionStorage = {
    getItem: (k) => items.get(k) || null,
    setItem: (k, v) => items.set(k, v),
    removeItem: (k) => items.delete(k),
  };
  const session = require("../.yokai-check/yokai/session.js");
  let first;
  for (let i = 0; i < 10; i++) {
    const job = createDemoInvestigation("responsive", input);
    first ??= job.id;
    session.storeInvestigation(job);
    assert.equal(session.readInvestigation(job.id).id, job.id);
  }
  assert.equal(session.readHistory().length, 8);
  assert.equal(session.readInvestigation(first), null);
  items.set("scamurai-yokai-history", '[null,{"id":"bad"}]');
  assert.deepEqual(session.readHistory(), []);
});

test("status snapshots and unavailable evidence remain honest, and HTTP timeouts are explicit", async () => {
  const demo = createDemoInvestigation("responsive", input);
  for (const status of [
    "queued",
    "initializing",
    "loading",
    "collecting",
    "comparing",
    "failed",
    "cancelled",
    "unsupported",
  ]) {
    const { result, ...snapshot } = demo;
    assert.equal(
      api.validateInvestigation({ ...snapshot, status }).status,
      status,
    );
  }
  const empty = {
    ...demo,
    result: {
      captures: [],
      findings: [],
      riskIndicators: [],
      limitations: ["No evidence was returned."],
      recommendations: [],
      graph: { nodes: [], edges: [] },
      counterfactuals: [],
    },
  };
  assert.equal(api.validateInvestigation(empty).result.captures.length, 0);
  const { config } = require("../.yokai-check/config.js");
  const timeout = config.timeout,
    original = global.fetch;
  config.timeout = 10;
  global.fetch = (_url, options) =>
    new Promise((_resolve, reject) => {
      options.signal.addEventListener(
        "abort",
        () => reject(options.signal.reason),
        { once: true },
      );
    });
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      api.getInvestigation("live-1", new AbortController().signal),
      /timed out/,
    );
  } finally {
    clearTimeout(keepAlive);
    config.timeout = timeout;
    global.fetch = original;
  }
});

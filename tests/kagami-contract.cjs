const { test } = require("node:test");
const assert = require("node:assert/strict");
process.env.NEXT_PUBLIC_KAGAMI_API_ENABLED = "true";
process.env.NEXT_PUBLIC_API_URL = "http://localhost:8000";
const api = require("../.kagami-check/kagami/api.js");
const mocks = require("../.kagami-check/kagami/mocks.js");
const types = require("../.kagami-check/kagami/types.js");
const schemas = require("../.kagami-check/kagami/schemas.js");
test('specific allowance client verifies returned pair and wallet context', async () => {
  const savedFetch = global.fetch;
  const report = liveWallet();
  const permission = report.permissions.find(p => p.type === 'erc20');
  try {
    global.fetch = async (url, options) => {
      assert.match(url, /wallets\/check-allowance$/);
      const body = JSON.parse(options.body);
      assert.equal(body.token, permission.token);
      return Response.json(report);
    };
    const result = await api.checkAllowance(report.wallet, report.network, permission.token, permission.spender, new AbortController().signal);
    assert.equal(result.id, report.id);
    await assert.rejects(() => api.checkAllowance(report.wallet, report.network, permission.token, '0x' + 'aa'.repeat(20), new AbortController().signal), /different allowance/);
  } finally { global.fetch = savedFetch; }
});
test("unsigned calldata builder preserves exact integers and supports canonical ERC-20 operations", () => {
  const target = "0x" + "22".repeat(20),
    owner = "0x" + "11".repeat(20);
  const max = ((1n << 256n) - 1n).toString();
  const approval = types.buildErc20Calldata("approve", target, max);
  assert.equal(approval.slice(-64), "f".repeat(64));
  assert.equal(types.buildErc20Calldata("transfer", target, "0").length, 138);
  assert.equal(
    types.buildErc20Calldata("transferFrom", target, "1", owner).length,
    202,
  );
  assert.throws(() =>
    types.buildErc20Calldata("approve", target, (1n << 256n).toString()),
  );
  assert.throws(() => types.buildErc20Calldata("approve", target, "1.5"));
  assert.throws(() =>
    types.buildErc20Calldata("transferFrom", target, "1", "bad"),
  );
});
const liveWallet = () => {
  const job = mocks.createWalletFixture("ethereum");
  return {
    ...job,
    id: "wallet-1",
    demo: false,
    evidence: job.evidence.map((e) => ({ ...e, source: "service" })),
  };
};
const liveTransaction = () => {
  const result = mocks.createTransactionFixture(
    mocks.demoTransaction("ethereum"),
    "preview",
  );
  return {
    ...result,
    demo: false,
    evidence: result.evidence.map((e) => ({ ...e, source: "service" })),
  };
};
test("wallet fixtures retain precise allowances, explicit relationships and delegation semantics", () => {
  const job = api.validateWallet(mocks.createWalletFixture("ethereum"));
  assert.equal(job.demo, true);
  assert.equal(job.permissions.filter((p) => p.type === "erc20").length, 3);
  assert.equal(
    job.permissions.find((p) => p.id === "unlimited").allowanceRaw,
    mocks.maximumAllowance,
  );
  assert.equal(typeof job.permissions[1].allowanceRaw, "string");
  assert.equal(
    job.permissions.find((p) => p.id === "delegation").allowanceRaw,
    null,
  );
  assert.equal(job.permissions.find((p) => p.id === "zero").active, false);
  const nodes = new Set(job.graph.nodes.map((n) => n.id));
  assert.ok(
    job.graph.edges.every((e) => nodes.has(e.source) && nodes.has(e.target)),
  );
  assert.ok(job.graph.edges.some((e) => e.label === "Delegates execution"));
  assert.equal(
    types.formatAllowance({
      ...job.permissions[0],
      allowanceRaw: "9007199254740993123456",
    }),
    "9007.199254740993123456 ORB",
  );
});
test("address and uint256 validation reject unsafe formats without number coercion", () => {
  assert.equal(types.isAddress(mocks.demoWallet), true);
  assert.equal(types.isAddress("0x1234"), false);
  assert.equal(schemas.uint256.safeParse(mocks.maximumAllowance).success, true);
  for (const value of ["abc", "-1", "1.5", "01", (1n << 256n).toString()])
    assert.equal(schemas.uint256.safeParse(value).success, false);
});
test("breakpoints remove only supplied active modeled permissions and never mutate evidence", () => {
  const job = mocks.createWalletFixture("ethereum"),
    before = JSON.stringify(job);
  assert.deepEqual(types.modeledSummary(job, []), {
    current: 3,
    removed: 0,
    remaining: 3,
  });
  assert.deepEqual(types.modeledSummary(job, ["unlimited"]), {
    current: 3,
    removed: 1,
    remaining: 2,
  });
  assert.deepEqual(types.modeledSummary(job, ["zero", "invented"]), {
    current: 3,
    removed: 0,
    remaining: 3,
  });
  assert.equal(JSON.stringify(job), before);
});
test("malformed graph, ownership, evidence and fabricated live responses are rejected", () => {
  for (const mutate of [
    (j) => (j.graph.edges[0].target = "missing"),
    (j) => (j.permissions[0].owner = mocks.demoSpender),
    (j) => (j.permissions[0].evidenceIds = ["missing"]),
    (j) => j.graph.nodes.push(j.graph.nodes[0]),
  ]) {
    const job = mocks.createWalletFixture("ethereum");
    mutate(job);
    assert.throws(() => api.validateWallet(job), api.KagamiApiError);
  }
  assert.throws(
    () => api.validateWallet(mocks.createWalletFixture("ethereum"), true),
    api.KagamiApiError,
  );
  const falseLive = mocks.createWalletFixture("ethereum");
  falseLive.demo = false;
  assert.throws(() => api.validateWallet(falseLive, true), api.KagamiApiError);
});
test("transaction fixtures support exact approval, reject unknown inputs, and avoid invented intent findings", () => {
  const input = mocks.demoTransaction("ethereum"),
    result = api.validateTransaction(
      mocks.createTransactionFixture(input, "preview"),
    );
  assert.equal(result.status, "successful");
  assert.equal(result.effects[0].kind, "approval");
  assert.equal(result.effects[0].direction, "permission");
  assert.equal(result.parameters[1].value, mocks.maximumAllowance);
  assert.equal(result.mismatches.length, 1);
  assert.equal(
    mocks.createTransactionFixture(
      { ...input, claimedPurpose: "Custom purpose" },
      "preview",
    ).mismatches.length,
    0,
  );
  const unsupported = mocks.createTransactionFixture(
    mocks.demoTransaction("ethereum", true),
    "preview",
  );
  assert.equal(unsupported.status, "unsupported");
  assert.equal(unsupported.effects.length, 0);
  assert.equal(
    mocks.createTransactionFixture(input, "decode").effects.length,
    0,
  );
  assert.equal(
    schemas.transactionInputSchema.safeParse({ ...input, calldata: "0x123" })
      .success,
    false,
  );
});
test("live client uses provisional paths, rejects mismatched contexts, and never falls back on errors", async () => {
  const original = global.fetch,
    calls = [];
  let payload = liveWallet(),
    status = 200;
  global.fetch = async (url, options) => {
    calls.push({ url, options });
    return Response.json(payload, { status });
  };
  try {
    const job = await api.analyzeWallet(
      mocks.demoWallet,
      "ethereum",
      new AbortController().signal,
    );
    assert.equal(job.demo, false);
    assert.ok(calls[0].url.endsWith("/api/v1/kagami/wallets/analyze"));
    assert.equal(JSON.parse(calls[0].options.body).wallet, mocks.demoWallet);
    payload = { ...liveWallet(), network: "sepolia" };
    await assert.rejects(
      api.analyzeWallet(
        mocks.demoWallet,
        "ethereum",
        new AbortController().signal,
      ),
      /different wallet or network/,
    );
    status = 404;
    await assert.rejects(
      api.analyzeWallet(
        mocks.demoWallet,
        "ethereum",
        new AbortController().signal,
      ),
      /not available/,
    );
    status = 200;
    payload = liveTransaction();
    assert.equal(
      (
        await api.previewTransaction(
          mocks.demoTransaction("ethereum"),
          new AbortController().signal,
        )
      ).effects.length,
      1,
    );
    payload = { ...payload, sender: mocks.demoSpender };
    await assert.rejects(
      api.decodeTransaction(
        mocks.demoTransaction("ethereum"),
        new AbortController().signal,
      ),
      /different transaction/,
    );
    global.fetch = async () => {
      throw Error("offline");
    };
    await assert.rejects(
      api.retrieveWallet("wallet-1", new AbortController().signal),
      /connection/,
    );
  } finally {
    global.fetch = original;
  }
});
test("aborted and timed-out requests stay explicit; partial and empty evidence are accepted", async () => {
  const original = global.fetch;
  global.fetch = async (_url, options) => {
    options.signal.throwIfAborted();
    throw Error("offline");
  };
  const aborted = new AbortController();
  aborted.abort();
  await assert.rejects(
    api.retrieveWallet("wallet-1", aborted.signal),
    (e) => e.name === "AbortError",
  );
  const { config } = require("../.kagami-check/config.js"),
    previous = config.timeout;
  config.timeout = 10;
  global.fetch = (_url, options) =>
    new Promise((_resolve, reject) =>
      options.signal.addEventListener(
        "abort",
        () => reject(options.signal.reason),
        { once: true },
      ),
    );
  const keepAlive = setTimeout(() => {}, 1000);
  try {
    await assert.rejects(
      api.retrieveWallet("wallet-1", new AbortController().signal),
      /timed out/,
    );
  } finally {
    global.fetch = original;
    config.timeout = previous;
    clearTimeout(keepAlive);
  }
  const job = {
    ...mocks.createWalletFixture("ethereum"),
    status: "partial",
    permissions: [],
    graph: null,
    evidence: [],
  };
  assert.equal(api.validateWallet(job).status, "partial");
  assert.equal(
    api.validateWallet({ ...job, status: "unsupported" }).permissions.length,
    0,
  );
});
test("session snapshot validates stored responses and explorer links are suppressed for demo", () => {
  const session = require("../.kagami-check/kagami/session.js");
  global.sessionStorage = {
    getItem: () => JSON.stringify(mocks.createWalletFixture("sepolia")),
  };
  assert.equal(session.readWalletSnapshot().network, "sepolia");
  global.sessionStorage = { getItem: () => "{bad" };
  assert.equal(session.readWalletSnapshot(), null);
  assert.equal(
    types.explorerAddress("ethereum", mocks.demoWallet, true),
    undefined,
  );
  assert.equal(
    types.explorerAddress("ethereum", "javascript:bad", false),
    undefined,
  );
  assert.equal(
    types.explorerAddress("sepolia", mocks.demoWallet, false),
    `https://sepolia.etherscan.io/address/${mocks.demoWallet}`,
  );
});

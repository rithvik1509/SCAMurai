import type {
  BrowserCapture,
  Counterfactual,
  DemoCase,
  EvidenceEdge,
  EvidenceNode,
  Finding,
  Investigation,
  InvestigationRequest,
  InvestigationResult,
} from "./types";
import { profileLabels } from "./types";

export const demoCases = [
  {
    id: "responsive" as const,
    title: "A responsive storefront",
    description: "Different layout. The same content and destinations.",
    target: "https://store.yokai.test/catalog",
    tag: "Cosmetic differences",
  },
  {
    id: "payment" as const,
    title: "A profile-specific payment form",
    description: "A payment request appears in the mobile profile only.",
    target: "https://store.yokai.test/checkout",
    tag: "Sensitive difference",
  },
  {
    id: "redirect" as const,
    title: "Two permitted redirect paths",
    description: "The same entry point leads profiles to different pages.",
    target: "https://offers.yokai.test/start",
    tag: "Redirect divergence",
  },
];

function buildGraph(
  captures: BrowserCapture[],
  target: string,
): InvestigationResult["graph"] {
  const nodes: EvidenceNode[] = [];
  const edges: EvidenceEdge[] = [];
  captures.forEach((capture, index) => {
    const root = `${capture.id}-profile`;
    const entry = `${capture.id}-entry`;
    const y = index * 280;
    nodes.push({
      id: root,
      kind: "profile",
      label: capture.label,
      description: `${capture.viewport.width} × ${capture.viewport.height}`,
      tone: "normal",
      evidenceIds: [capture.id],
      profileId: capture.profileId,
      position: { x: 0, y },
    });
    nodes.push({
      id: entry,
      kind: "url",
      label: new URL(target).pathname,
      description: new URL(target).hostname,
      tone: "normal",
      evidenceIds: [capture.id],
      profileId: capture.profileId,
      position: { x: 260, y },
    });
    edges.push({
      id: `${root}-loads`,
      source: root,
      target: entry,
      label: "Loaded entry URL",
      tone: "normal",
      evidenceIds: [capture.id],
    });
    let source = entry;
    capture.redirects.forEach((redirect, i) => {
      const id = `${capture.id}-redirect-${i}`;
      nodes.push({
        id,
        kind: "url",
        label: new URL(redirect.to).pathname,
        description: redirect.to,
        tone: "difference",
        evidenceIds: [capture.id],
        profileId: capture.profileId,
        position: { x: 520 + i * 260, y },
      });
      edges.push({
        id: `${id}-edge`,
        source,
        target: id,
        label: `HTTP ${redirect.status} redirect`,
        tone: "difference",
        evidenceIds: [capture.id],
      });
      source = id;
    });
    capture.forms.forEach((form, i) => {
      const id = `${capture.id}-${form.id}`;
      nodes.push({
        id,
        kind: "form",
        label: form.label,
        description: form.fields.join(", "),
        tone: form.sensitive ? "sensitive" : "normal",
        evidenceIds: [capture.id],
        profileId: capture.profileId,
        position: { x: capture.redirects.length ? 800 : 520, y: y + i * 105 },
      });
      edges.push({
        id: `${id}-edge`,
        source,
        target: id,
        label: "Rendered form",
        tone: form.sensitive ? "sensitive" : "normal",
        evidenceIds: [capture.id],
      });
    });
    capture.network.forEach((request, i) => {
      const id = `${capture.id}-${request.id}`;
      nodes.push({
        id,
        kind: "network",
        label: new URL(request.url).hostname,
        description: `${request.method} ${new URL(request.url).pathname}`,
        tone: "normal",
        evidenceIds: [capture.id],
        profileId: capture.profileId,
        position: {
          x: capture.redirects.length ? 1060 : 780,
          y: y + 105 + i * 105,
        },
      });
      edges.push({
        id: `${id}-edge`,
        source,
        target: id,
        label: `Observed ${request.method}`,
        tone: "normal",
        evidenceIds: [capture.id],
      });
    });
  });
  return { nodes, edges };
}

export function createDemoInvestigation(
  scenario: DemoCase,
  request: InvestigationRequest,
): Investigation {
  const demo = demoCases.find((item) => item.id === scenario)!;
  const captures: BrowserCapture[] = request.profiles.map((profileId) => {
    const mobile = profileId === "mobile";
    const finalUrl =
      scenario === "redirect"
        ? `https://offers.yokai.test/${mobile ? "mobile-offer" : "offer"}`
        : demo.target;
    const payment = scenario === "payment" && mobile;
    return {
      id: `capture-${profileId}`,
      profileId,
      label: profileLabels[profileId],
      finalUrl,
      title:
        scenario === "redirect"
          ? mobile
            ? "Mobile offer"
            : "Seasonal offer"
          : scenario === "payment"
            ? "Complete your order"
            : "Fieldwork — everyday essentials",
      viewport: { width: mobile ? 390 : 1440, height: mobile ? 844 : 900 },
      userAgent: "Chromium / identical controlled fixture agent",
      cookieState:
        profileId === "returning"
          ? "Returning-visitor fixture cookie"
          : "Fresh profile",
      availability: "complete",
      notes: [
        "Illustrative evidence authored for this demo. No browser was launched and no website was contacted.",
      ],
      screenshot: {
        url: `/yokai/${scenario}-${mobile ? "mobile" : "desktop"}.svg`,
        kind: "illustration",
      },
      redirects:
        scenario === "redirect"
          ? [{ from: demo.target, to: finalUrl, status: 302 }]
          : [],
      structure: {
        headings:
          scenario === "responsive"
            ? ["Objects for everyday life", "Made to last."]
            : [
                payment
                  ? "Payment verification"
                  : scenario === "redirect"
                    ? mobile
                      ? "Your mobile offer"
                      : "Your seasonal offer"
                    : "Review your order",
              ],
        linkCount: mobile ? 7 : 12,
        language: "en",
      },
      forms: payment
        ? [
            {
              id: "payment-form",
              label: "Payment verification",
              action: "https://payments.yokai.test/verify",
              method: "POST",
              fields: ["Card number", "Expiry", "Security code"],
              sensitive: true,
            },
          ]
        : [],
      network: [
        {
          id: "catalog-request",
          url:
            scenario === "redirect"
              ? "https://assets.yokai.test/offer.css"
              : "https://assets.yokai.test/catalog.json",
          method: "GET",
          kind: "Resource request",
        },
      ],
    };
  });
  const evidenceIds = captures.map((c) => c.id);
  const hasMobile = captures.some((c) => c.profileId === "mobile");
  const findings: Finding[] = [
    {
      id: "layout",
      title: hasMobile
        ? "Layout changes with the viewport"
        : "Selected captures share the same layout",
      explanation: hasMobile
        ? "The fixture records a narrower layout and a smaller navigation link count in the mobile viewport. A responsive layout difference is not a fraud finding."
        : "Both selected profiles use a desktop viewport. No viewport-dependent difference can be inferred.",
      tone: "normal",
      evidenceIds,
    },
  ];
  if (hasMobile && scenario === "payment")
    findings.push({
      id: "payment-only",
      title: "Payment fields appear only in the mobile capture",
      explanation:
        "The mobile fixture contains a card-details form. The other selected profiles contain no form. This difference needs review; it does not establish malicious intent.",
      tone: "sensitive",
      evidenceIds,
    });
  if (hasMobile && scenario === "redirect")
    findings.push({
      id: "redirect-path",
      title: "The mobile profile follows a different redirect",
      explanation:
        "The entry URL returns a recorded HTTP 302 to /mobile-offer for mobile and /offer for the other profiles. Both destinations belong to the controlled fixture.",
      tone: "difference",
      evidenceIds,
    });
  const counterfactuals: Counterfactual[] =
    hasMobile && captures.some((c) => c.profileId === "desktop")
      ? [
          {
            id: "viewport",
            title: "What changes when the viewport changes?",
            baseline:
              "1440 × 900 viewport, fresh profile, identical fixture user agent.",
            changedVariable:
              "Viewport changed to 390 × 844. User agent and fresh-cookie state were held fixed in the fixture.",
            observedResult:
              scenario === "payment"
                ? "The mobile capture includes a payment-verification form."
                : scenario === "redirect"
                  ? "The recorded destination changes from /offer to /mobile-offer."
                  : "The layout and number of visible navigation links change; the content and destinations stay consistent.",
            finding:
              "This illustrative controlled comparison associates the viewport change with the recorded behavior. It cannot establish a site's intent or explain how a real site would behave.",
            conclusion: "controlled",
            evidenceIds: evidenceIds.filter((id) => id !== "capture-returning"),
          },
        ]
      : [
          {
            id: "incomplete",
            title: "No isolated viewport comparison is available",
            baseline: "A fresh desktop and fresh mobile pair was not selected.",
            changedVariable:
              "Viewport and returning-visitor cookie state may differ together.",
            observedResult:
              "Only the selected profiles are available for comparison.",
            finding:
              "These captures cannot isolate the effect of changing the viewport alone.",
            conclusion: "inconclusive",
            evidenceIds,
          },
        ];
  const now = "2026-10-23T09:00:00.000Z";
  return {
    id: `demo-${scenario}-${crypto.randomUUID()}`,
    demo: true,
    targetUrl: demo.target,
    profiles: [...request.profiles],
    status: "completed",
    createdAt: now,
    updatedAt: now,
    events: [
      {
        status: "completed",
        at: now,
        message:
          "Fixed demonstration fixture. This is not a live investigation.",
      },
    ],
    result: {
      captures,
      findings,
      graph: buildGraph(captures, demo.target),
      counterfactuals,
      riskIndicators:
        scenario === "payment" && hasMobile
          ? ["Profile-specific collection of payment details warrants review."]
          : scenario === "redirect" && hasMobile
            ? [
                "Profile-dependent redirects warrant checking the purpose of each destination.",
              ]
            : [],
      limitations: [
        "This is fictional, explicitly labeled demonstration evidence, not a security assessment.",
        "Captures describe one controlled observation per profile; real behavior can change over time.",
        "No form was submitted. No credential, payment, or session data was collected.",
        "A difference between profiles, or the absence of a difference, cannot establish safety or malicious intent.",
      ],
      recommendations: [
        "Review the observed differences and the exact destinations before entering sensitive information.",
        "Confirm that any payment or sign-in request is expected using an independently known contact.",
        "For live investigations, use only targets authorized and permitted by the connected backend.",
      ],
    },
  };
}

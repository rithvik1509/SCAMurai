import type {
  Analysis,
  AnalyzeRequest,
  Incident,
  RescueResponse,
} from "./types";
export const examples = {
  bank: "Dear customer, your bank account will be blocked in 2 hours. Update your KYC immediately at https://kyc-verify.example and pay ₹499 to avoid suspension.",
  benign: "Hi, dinner is at 7 tonight. Let me know if you can make it.",
  url: "https://kyc-verify.example/activate",
  crypto:
    "0x095ea7b3" +
    "0".repeat(24) +
    "1234567890123456789012345678901234567890" +
    "f".repeat(64),
};
export function mockAnalysis(request: AnalyzeRequest): Analysis {
  const benign = request.content === examples.benign;
  const crypto = request.mode === "crypto";
  // Fixtures are intentionally fixed scenarios, never an analysis of arbitrary input.
  return {
    demo: true,
    input: request.content,
    score: benign ? 12 : crypto ? 92 : 87,
    level: benign ? "LOW" : "HIGH",
    category: benign
      ? "Everyday conversation"
      : crypto
        ? "Reward and approval mismatch"
        : "Bank impersonation",
    explanation: benign
      ? "This demonstration contains no clear financial scam signals. A low score is not a guarantee of safety."
      : crypto
        ? "The sample promises a reward but asks for permission to spend tokens. Review the spender and allowance before signing."
        : "This sample uses an account suspension threat to pressure someone into paying a fee through an unverified link.",
    signals: benign
      ? []
      : crypto
        ? [
            {
              name: "Reward bait",
              explanation:
                "A free token reward is used to encourage a wallet approval.",
              evidence: "Claim your free USDT reward.",
            },
            {
              name: "Unlimited permission",
              explanation:
                "The example approval allows a spender to transfer tokens up to an unlimited allowance.",
            },
          ]
        : [
            {
              name: "Manufactured urgency",
              explanation:
                "A short deadline discourages independent verification.",
              evidence: "blocked in 2 hours",
            },
            {
              name: "Bank impersonation",
              explanation:
                "The sender claims to represent a bank without independent verification.",
              evidence: "Dear customer",
            },
            {
              name: "Payment request",
              explanation:
                "The sample asks for a fee to avoid account suspension.",
              evidence: "pay ₹499",
            },
            {
              name: "Unverified link",
              explanation:
                "The reserved example domain represents a suspicious destination.",
              evidence: "https://kyc-verify.example",
            },
          ],
    actions: benign
      ? ["Verify unexpected requests through a separate, trusted channel."]
      : [
          "Do not pay, share an OTP, or approve a transaction from this request.",
          "Contact the institution using its official app or a known phone number.",
          "Preserve the message, sender details, and any transaction reference.",
        ],
    limitations: [
      "Demonstration fixture only. This is not a security assessment of your submitted content.",
      "Sender identity, website reputation, and on-chain activity have not been verified.",
    ],
    ...(crypto
      ? {
          transaction: {
            contract: request.tokenAddress || "Not provided",
            spender: "0x1234567890123456789012345678901234567890",
            allowance: "Unlimited",
            approval: "Unlimited" as const,
            promise: request.promise || "Claim your free USDT reward.",
            action:
              "Allow the spender to transfer an unlimited amount of your tokens.",
            verdict:
              "The promised reward does not match the requested spending permission. Unlimited approval alone does not prove fraud.",
          },
        }
      : {}),
  };
}
export const incidentLabels: Record<Incident, string> = {
  message: "I received a suspicious message",
  link: "I clicked a suspicious link",
  password: "I entered my password",
  otp: "I shared an OTP",
  money: "I transferred money",
  crypto: "I approved a crypto transaction",
};
export function mockRescue(incident: Incident): RescueResponse {
  const first: Record<Incident, string[]> = {
    message: [
      "Do not reply, open links, or share personal information.",
      "Verify the request through the institution’s official app or a known number.",
    ],
    link: [
      "Close the page and do not enter any information or install files.",
      "If you downloaded software, disconnect the device and ask a trusted technician to inspect it.",
    ],
    password: [
      "Use a trusted device to change the password on the real website.",
      "Sign out of other sessions and enable multifactor authentication.",
      "Change reused passwords on other accounts.",
    ],
    otp: [
      "Contact your bank or service provider immediately using an official channel.",
      "Ask them to secure the account and review recent activity.",
    ],
    money: [
      "Contact your bank or payment provider immediately and report the transaction as suspected fraud.",
      "In India, call 1930 promptly and file a complaint at cybercrime.gov.in.",
    ],
    crypto: [
      "Do not sign additional transactions from the sender.",
      "Review and revoke unwanted approvals using a trusted wallet or verified block explorer.",
      "If your wallet keys were exposed, get help securing remaining assets with a new wallet.",
    ],
  };
  return {
    demo: true,
    steps: [
      ...first[incident],
      "Keep a record of the incident and any report or complaint number.",
    ],
    preserve: [
      "Original messages and sender details",
      "URLs and screenshots",
      "Transaction IDs, amounts, and timestamps",
    ],
    warning:
      "Recovery or reversal is not guaranteed. Never pay a “recovery agent” or share a seed phrase.",
  };
}

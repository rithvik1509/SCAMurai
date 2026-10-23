export const config = {
  apiUrl: process.env.NEXT_PUBLIC_API_URL || "http://localhost:8000",
  demo: process.env.NEXT_PUBLIC_DEMO_MODE !== "false",
  timeout: 15000,
};

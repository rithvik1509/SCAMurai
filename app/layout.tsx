import type { Metadata } from "next";
import "@fontsource/geist/400.css";
import "@fontsource/geist/500.css";
import "@fontsource/geist/600.css";
import "@fontsource/geist/700.css";
import "@fontsource/geist-mono/400.css";
import "./globals.css";
import "./experience.css";
import "./workspace.css";
import "./workspace-interactions.css";
import "./persistent-story.css";
import "./brand.css";
import "./yokai.css";
import "./kagami.css";
import { Shell } from "@/components/layout/shell";
import { AuthProvider } from "@/lib/auth";
export const metadata: Metadata = {
  icons: {
    icon: "/brand/scamurai-logo.png",
    apple: "/brand/scamurai-logo.png",
  },
  title: "SCAMurai — Understand the scam. Stop the mistake.",
  description:
    "Understand suspicious messages, links, and wallet permissions before you act. Frontend demonstration for NEXATHON 2026.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" data-scroll-behavior="smooth">
      <body>
        <AuthProvider>
          <Shell>{children}</Shell>
        </AuthProvider>
      </body>
    </html>
  );
}

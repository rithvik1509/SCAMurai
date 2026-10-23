"use client";
import {
  createContext,
  useContext,
  useEffect,
  useState,
  useCallback,
} from "react";

export interface WorkspaceSession {
  name: string;
  kind: "demo";
}
export interface AuthAdapter {
  getSession(): Promise<WorkspaceSession | null>;
  signIn(name: string): Promise<WorkspaceSession>;
  signOut(): Promise<void>;
}
const demoAdapter: AuthAdapter = {
  async getSession() {
    try {
      const raw = sessionStorage.getItem("scamurai-session");
      const value = raw ? JSON.parse(raw) : null;
      return value?.kind === "demo" && typeof value.name === "string"
        ? value
        : null;
    } catch {
      return null;
    }
  },
  async signIn(name) {
    const session: WorkspaceSession = {
      name: name.trim().slice(0, 40) || "Investigator",
      kind: "demo",
    };
    sessionStorage.setItem("scamurai-session", JSON.stringify(session));
    return session;
  },
  async signOut() {
    Object.keys(sessionStorage)
      .filter((key) => key.startsWith("scamurai-"))
      .forEach((key) => sessionStorage.removeItem(key));
  },
};
// Replace this adapter with an agreed, server-verified auth provider for real accounts.
const AuthContext = createContext<{
  session: WorkspaceSession | null;
  loading: boolean;
  signIn: (name: string) => Promise<void>;
  signOut: () => Promise<void>;
}>({
  session: null,
  loading: true,
  signIn: async () => {},
  signOut: async () => {},
});
export function AuthProvider({ children }: { children: React.ReactNode }) {
  const [session, setSession] = useState<WorkspaceSession | null>(null);
  const [loading, setLoading] = useState(true);
  const refresh = useCallback(() => {
    void demoAdapter
      .getSession()
      .then(setSession)
      .finally(() => setLoading(false));
  }, []);
  useEffect(() => {
    refresh();
    window.addEventListener("pageshow", refresh);
    return () => window.removeEventListener("pageshow", refresh);
  }, [refresh]);
  return (
    <AuthContext.Provider
      value={{
        session,
        loading,
        signIn: async (name) => {
          setSession(await demoAdapter.signIn(name));
        },
        signOut: async () => {
          await demoAdapter.signOut();
          setSession(null);
        },
      }}
    >
      {children}
    </AuthContext.Provider>
  );
}
export const useAuth = () => useContext(AuthContext);
export function safeReturnPath(value: string | null | undefined) {
  if (
    !value ||
    !/^\/dashboard(?:\/|\?|$)/.test(value) ||
    value.includes("\\") ||
    /[\r\n]/.test(value)
  )
    return "/dashboard";
  return value;
}

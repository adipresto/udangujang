"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import {
  getRedirectResult,
  GoogleAuthProvider,
  signInWithEmailAndPassword,
  signInWithRedirect,
} from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

// Session key mirrors the pre-merge dashboard (reference/udang-dashboard/
// index.html ~line 1972). The admin layout treats its age as the 24h TTL.
const SESSION_KEY = "udang-login-at";

// Indonesian error mapping in the spirit of the dashboard's pesanAuthError
// (reference lines ~2140-2145), extended with invalid-email/popup-closed
// cases the old overlay never hit.
function pesanAuthError(code: string | undefined): string {
  if (
    code === "auth/invalid-credential" ||
    code === "auth/wrong-password" ||
    code === "auth/user-not-found"
  )
    return "Email atau password salah.";
  if (code === "auth/invalid-email") return "Format email tidak valid.";
  if (code === "auth/popup-closed-by-user" || code === "auth/cancelled-popup-request")
    return "Login Google dibatalkan.";
  if (code === "auth/too-many-requests") return "Terlalu banyak percobaan. Coba lagi nanti.";
  return `Login gagal (${code ?? "tidak diketahui"})`;
}

function errorCode(e: unknown): string | undefined {
  if (typeof e === "object" && e !== null && "code" in e) {
    const c = (e as { code: unknown }).code;
    return typeof c === "string" ? c : undefined;
  }
  return undefined;
}

const inputStyle: React.CSSProperties = {
  width: "100%",
  padding: "10px 12px",
  border: "1px solid #CBD5E1",
  borderRadius: 8,
  fontSize: 14,
  color: "#0F172A",
  boxSizing: "border-box",
};

const labelStyle: React.CSSProperties = {
  display: "block",
  fontSize: 13,
  fontWeight: 600,
  color: "#334155",
  marginBottom: 4,
};

export default function LoginPage() {
  const router = useRouter();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [loading, setLoading] = useState(false);
  const [googleLoading, setGoogleLoading] = useState(false);

  // Handle hasil redirect Google login (port of reference lines ~1995-2003).
  useEffect(() => {
    getRedirectResult(getFirebaseAuth())
      .then((result) => {
        if (result?.user) {
          localStorage.setItem(SESSION_KEY, Date.now().toString());
          router.push("/admin");
        }
      })
      .catch((e) => {
        setError(pesanAuthError(errorCode(e)));
      });
  }, [router]);

  async function doLogin(e: React.FormEvent) {
    e.preventDefault();
    setError("");
    setLoading(true);
    try {
      await signInWithEmailAndPassword(getFirebaseAuth(), email.trim(), password);
      localStorage.setItem(SESSION_KEY, Date.now().toString());
      router.push("/admin");
    } catch (err) {
      setError(pesanAuthError(errorCode(err)));
      setLoading(false);
    }
  }

  async function doLoginGoogle() {
    setError("");
    setGoogleLoading(true);
    try {
      await signInWithRedirect(getFirebaseAuth(), new GoogleAuthProvider());
      // Halaman akan redirect — kode di bawah tidak akan dieksekusi.
    } catch (err) {
      setError(pesanAuthError(errorCode(err)));
      setGoogleLoading(false);
    }
  }

  return (
    <main
      className="flex min-h-screen items-center justify-center"
      style={{
        display: "flex",
        minHeight: "100vh",
        alignItems: "center",
        justifyContent: "center",
        background: "#F1F5F9",
        padding: 16,
      }}
    >
      <div
        className="w-full max-w-sm rounded-xl bg-white p-6 shadow"
        style={{
          width: "100%",
          maxWidth: 380,
          background: "#fff",
          borderRadius: 12,
          padding: 24,
          boxShadow: "0 4px 24px rgba(15,23,42,.08)",
        }}
      >
        <h1 style={{ fontSize: 20, fontWeight: 700, color: "#0F172A", margin: "0 0 4px" }}>
          Udang Ujang — Admin
        </h1>
        <p style={{ fontSize: 13, color: "#64748B", margin: "0 0 16px" }}>
          Masuk untuk mengelola harga &amp; promo.
        </p>
        <form onSubmit={doLogin}>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="login-email" style={labelStyle}>
              Email
            </label>
            <input
              id="login-email"
              type="email"
              placeholder="Email"
              autoComplete="username"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              style={inputStyle}
            />
          </div>
          <div style={{ marginBottom: 12 }}>
            <label htmlFor="login-password" style={labelStyle}>
              Password
            </label>
            <input
              id="login-password"
              type="password"
              placeholder="Password"
              autoComplete="current-password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              style={inputStyle}
            />
          </div>
          {error && (
            <p role="alert" style={{ fontSize: 12, color: "#DC2626", margin: "0 0 12px" }}>
              {error}
            </p>
          )}
          <button
            id="login-btn"
            type="submit"
            disabled={loading}
            className="w-full rounded-lg bg-slate-900 py-2.5 text-sm font-semibold text-white"
            style={{
              width: "100%",
              padding: 10,
              background: "#0F172A",
              color: "#fff",
              border: 0,
              borderRadius: 8,
              fontSize: 14,
              fontWeight: 600,
              cursor: loading ? "default" : "pointer",
              opacity: loading ? 0.7 : 1,
            }}
          >
            {loading ? "Memuat..." : "Masuk dengan Email"}
          </button>
        </form>
        <button
          id="google-btn"
          type="button"
          onClick={doLoginGoogle}
          disabled={googleLoading}
          style={{
            width: "100%",
            padding: 10,
            marginTop: 10,
            background: "#fff",
            color: "#374151",
            border: "1px solid #CBD5E1",
            borderRadius: 8,
            fontSize: 13,
            fontWeight: 600,
            cursor: googleLoading ? "default" : "pointer",
            opacity: googleLoading ? 0.7 : 1,
          }}
        >
          Masuk dengan Google
        </button>
      </div>
    </main>
  );
}

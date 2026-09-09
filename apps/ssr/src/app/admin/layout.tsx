"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { onAuthStateChanged, signOut, type User } from "firebase/auth";
import { getFirebaseAuth } from "@/lib/firebase-client";

// Ports the pre-merge dashboard session logic (reference/udang-dashboard/
// index.html ~lines 1971-1978, 2006-2037): 24h TTL on the login timestamp,
// allowlist by email. Empty NEXT_PUBLIC_ADMIN_EMAILS = everyone allowed.
const SESSION_TTL = 24 * 60 * 60 * 1000;
const SESSION_KEY = "udang-login-at";

function allowedEmails(): string[] {
  return (process.env.NEXT_PUBLIC_ADMIN_EMAILS ?? "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

const linkStyle = (active: boolean): React.CSSProperties => ({
  padding: "6px 12px",
  borderRadius: 8,
  fontSize: 13,
  fontWeight: 600,
  textDecoration: "none",
  color: active ? "#fff" : "#334155",
  background: active ? "#0F172A" : "#F1F5F9",
});

export default function AdminLayout({ children }: { children: React.ReactNode }) {
  const router = useRouter();
  const pathname = usePathname();
  const [user, setUser] = useState<User | null>(null);
  const [checking, setChecking] = useState(true);
  const [denied, setDenied] = useState("");

  useEffect(() => {
    const auth = getFirebaseAuth();
    const unsub = onAuthStateChanged(auth, async (u) => {
      if (!u) {
        router.replace("/login");
        return;
      }
      // Sesi lama — cek apakah sudah kadaluarsa (reference ~2011-2015).
      const loginAtStr = localStorage.getItem(SESSION_KEY);
      if (loginAtStr && Date.now() - parseInt(loginAtStr, 10) > SESSION_TTL) {
        localStorage.removeItem(SESSION_KEY);
        await signOut(auth);
        router.replace("/login");
        return;
      }
      // Allowlist email (reference _afterLogin ~2030-2038).
      const allow = allowedEmails();
      if (allow.length > 0 && !allow.includes((u.email ?? "").toLowerCase())) {
        localStorage.removeItem(SESSION_KEY);
        await signOut(auth);
        setDenied(`Akun ${u.email ?? ""} tidak diizinkan mengakses dashboard ini.`);
        setChecking(false);
        return;
      }
      setUser(u);
      setChecking(false);
    });
    return unsub;
  }, [router]);

  async function doLogout() {
    localStorage.removeItem(SESSION_KEY);
    await signOut(getFirebaseAuth());
    router.replace("/login");
  }

  if (checking) {
    return (
      <main style={{ padding: 24, fontSize: 14, color: "#64748B" }}>Memeriksa sesi...</main>
    );
  }

  if (denied) {
    return (
      <main style={{ padding: 24 }}>
        <p role="alert" style={{ fontSize: 14, color: "#DC2626" }}>
          {denied}
        </p>
        <Link href="/login" style={{ fontSize: 14 }}>
          Kembali ke login
        </Link>
      </main>
    );
  }

  if (!user) return null;

  return (
    <div style={{ minHeight: "100vh", background: "#F8FAFC" }}>
      <header
        style={{
          display: "flex",
          alignItems: "center",
          gap: 8,
          padding: "12px 16px",
          background: "#fff",
          borderBottom: "1px solid #E2E8F0",
          position: "sticky",
          top: 0,
          zIndex: 10,
        }}
      >
        <strong style={{ fontSize: 15, color: "#0F172A", marginRight: 8 }}>
          Udang Ujang — Admin
        </strong>
        <nav style={{ display: "flex", gap: 8, flex: 1 }}>
          <Link
            href="/admin/pesanan"
            style={linkStyle(
              pathname === "/admin/pesanan" || pathname.startsWith("/admin/pesanan/"),
            )}
          >
            Pesanan
          </Link>
          <Link
            href="/admin/harga"
            style={linkStyle(pathname === "/admin/harga" || pathname === "/admin")}
          >
            Harga
          </Link>
          <Link href="/admin/promo" style={linkStyle(pathname === "/admin/promo")}>
            Promo
          </Link>
          <Link href="/pesan" style={linkStyle(false)}>
            Form Pemesanan
          </Link>
        </nav>
        <span style={{ fontSize: 12, color: "#64748B" }}>{user.email}</span>
        <button
          type="button"
          onClick={doLogout}
          style={{
            fontSize: 12,
            padding: "4px 10px",
            background: "transparent",
            border: "1px solid #CBD5E1",
            borderRadius: 6,
            cursor: "pointer",
            color: "#334155",
          }}
        >
          Keluar
        </button>
      </header>
      <main style={{ padding: 16, maxWidth: 960, margin: "0 auto" }}>{children}</main>
    </div>
  );
}

import type { CSSProperties } from "react";
import type { AuthProvider } from "@/lib/admin-data";

const STYLES: Record<AuthProvider, CSSProperties> = {
  kakao: {
    background: "#FEE500",
    color: "#191919",
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  google: {
    background: "#E8F0FE",
    color: "#1967D2",
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
  email: {
    background: "#F5F5F4",
    color: "#78716C",
    fontSize: 11,
    fontWeight: 700,
    padding: "3px 8px",
    borderRadius: 12,
    display: "inline-flex",
    alignItems: "center",
    gap: 4,
  },
};

const LABELS: Record<AuthProvider, string> = {
  kakao: "💬 카카오",
  google: "🌐 구글",
  email: "✉️ 이메일",
};

export function ProviderBadge({ provider }: { provider: AuthProvider }) {
  return <span style={STYLES[provider]}>{LABELS[provider]}</span>;
}

export function KakaoPrivateEmailHint() {
  return (
    <span style={{ color: "#A8A29E", fontSize: 12 }}>카카오 간편가입 (이메일 비공개)</span>
  );
}

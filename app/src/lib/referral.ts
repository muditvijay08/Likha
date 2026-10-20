// Who brought this member, and links they opened before signing up. All best-effort: a failure never blocks onboarding.
import { api } from "./api";

const CLAIM_KEY = "likha-claim";
export type Claim = { type: "crush" | "gift"; token: string };

/** Right after the profile row exists: an invite code wins; otherwise the Cupid cookie set by likha.in/c/<code>. One referrer per person. */
export async function attachReferrer(inviteCode?: string) {
  try {
    if (inviteCode) { await api().redeemInvite(inviteCode); return; }
    const raw = document.cookie.split("; ").find((c) => c.startsWith("likha_cupid="))?.slice("likha_cupid=".length);
    if (!raw) return;
    const [code, click] = decodeURIComponent(raw).split(".");
    if (code) await api().attachCupid(code, click && /^\d+$/.test(click) ? Number(click) : null);
  } catch { /* the team can attach it by hand from Admin */ }
}

export function saveClaim(c: Claim) { try { localStorage.setItem(CLAIM_KEY, JSON.stringify(c)); } catch { /* private mode */ } }
export function takeClaim(): Claim | null {
  try { const v = localStorage.getItem(CLAIM_KEY); localStorage.removeItem(CLAIM_KEY); return v ? JSON.parse(v) as Claim : null; } catch { return null; }
}

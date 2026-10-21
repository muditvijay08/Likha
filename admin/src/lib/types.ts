export interface Me { name: string; role: string; mfa: boolean; perms: string[] }
export interface KeySlot { key: string; mode: "any" | "test" | "live"; grp: string; label: string; provider: string | null; is_public: boolean; is_secret: boolean;
  testable: boolean; hint: string | null; set: boolean; shown: string | null; set_at: string | null; set_by: string | null; tested_at: string | null;
  test_ok: boolean | null; test_note: string | null; in_use: boolean }
export interface Keys { payments_mode: "test" | "live"; slots: KeySlot[] }
export interface Model { model: string; provider: "anthropic" | "gemini" | "openai" | "fal"; kind: "text" | "image"; label: string; input: number; output: number;
  per_image: number | null; note: string | null; active: boolean; verified_at: string | null; test_note: string | null; key_set: boolean; used_by: string[] }
export interface Feature { key: string; label: string; kind: "text" | "image"; model: string; fallback: string | null; enabled: boolean; paid: boolean; spent_7d_paise: number }
export interface Ai { can_edit: boolean; usd_inr: number; models: Model[]; features: Feature[] }
export interface TestResult { ok: boolean; note: string; preview?: string }
export interface MfaState { level: "aal1" | "aal2" | null; factorId: string | null }

export interface AdminApi {
  readonly demo: boolean;
  sendCode(email: string): Promise<void>;
  verifyCode(email: string, code: string): Promise<void>;
  mfaState(): Promise<MfaState>;
  enrollMfa(): Promise<{ factorId: string; qr: string; secret: string }>;
  verifyMfa(factorId: string, code: string): Promise<void>;
  me(): Promise<Me | null>;
  signOut(): Promise<void>;
  keys(): Promise<Keys>;
  setKey(key: string, mode: string, value: string): Promise<void>;
  clearKey(key: string, mode: string): Promise<void>;
  setPaymentsMode(mode: "test" | "live", confirm: string): Promise<void>;
  testKey(key: string, mode: string): Promise<TestResult>;
  ai(): Promise<Ai>;
  setFeatureModel(feature: string, model: string, fallback: string | null): Promise<void>;
  saveModel(m: Pick<Model, "model" | "provider" | "kind" | "label" | "input" | "output" | "per_image" | "note" | "active">): Promise<void>;
  testModel(model: string): Promise<TestResult>;
}

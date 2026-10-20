"use client";
// O7 Photos (step 4). 2 to 6 photos, first one needs a clear face. Resized in the browser before upload.
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { ErrorNote, Primary, Screen, StepHeader, useAction } from "@/components/ui";
import { api, type Photo } from "@/lib/api";
import { useGuard } from "@/lib/guard";

async function shrink(file: File, max = 1600): Promise<Blob> {
  if (!file.type.startsWith("image/")) throw new Error("Please pick a photo.");
  if (file.size > 15 * 1024 * 1024) throw new Error("That photo is over 15 MB. Pick a smaller one.");
  const bmp = await createImageBitmap(file).catch(() => null);
  if (!bmp) return file;
  const k = Math.min(1, max / Math.max(bmp.width, bmp.height));
  const c = document.createElement("canvas");
  c.width = Math.round(bmp.width * k); c.height = Math.round(bmp.height * k);
  c.getContext("2d")!.drawImage(bmp, 0, 0, c.width, c.height);
  return await new Promise<Blob>((ok) => c.toBlob((b) => ok(b ?? file), "image/jpeg", 0.85));
}

export default function Photos() {
  useGuard();
  const router = useRouter();
  const [photos, setPhotos] = useState<Photo[]>([]);
  const [uploading, setUploading] = useState<number | null>(null);
  const picker = useRef<HTMLInputElement>(null);
  const target = useRef(1);
  const { busy, error, run, setError } = useAction();

  useEffect(() => { api().photos().then(setPhotos).catch(() => {}); }, []);

  const at = (pos: number) => photos.find((p) => p.position === pos);
  const good = photos.filter((p) => p.status !== "rejected").length;

  function choose(pos: number) { target.current = pos; picker.current?.click(); }

  async function onFile(file: File | undefined) {
    if (!file) return;
    const pos = target.current;
    setUploading(pos); setError(null);
    try {
      const ph = await api().uploadPhoto(await shrink(file), pos);
      setPhotos((old) => [...old.filter((p) => p.position !== pos), ph].sort((a, b) => a.position - b.position));
    } catch (e) { setError(e instanceof Error ? e.message : "Upload failed. Try again."); }
    finally { setUploading(null); if (picker.current) picker.current.value = ""; }
  }

  async function remove(p: Photo) {
    await api().removePhoto(p.id);
    setPhotos((old) => old.filter((x) => x.id !== p.id));
  }

  const firstFree = [1, 2, 3, 4, 5, 6].find((n) => !at(n)) ?? 6;

  const submit = () => run(async () => {
    if (good < 2) throw new Error("Add at least 2 photos.");
    if (!at(1)) throw new Error("Your first photo needs your face, clearly.");
    await api().setStep(5);
    await api().refresh();
    router.push("/selfie");
  });

  return (
    <Screen style={{ gap: 16 }}>
      <StepHeader step={4} back="/birth" />
      <div className="stack">
        <h1 className="h1">Add your photos</h1>
        <p className="sub">2 to 6 photos. Your first photo needs your face, clearly.</p>
      </div>

      <input ref={picker} type="file" accept="image/*" hidden onChange={(e) => onFile(e.target.files?.[0])} />
      <div className="photos">
        {[1, 2, 3, 4, 5, 6].map((pos) => {
          const p = at(pos);
          if (p) return (
            <div key={pos} className={`slot filled${p.status === "rejected" ? " bad" : ""}`}>
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img src={p.url} alt={`Photo ${pos}`} />
              {pos === 1 && <span className="main">Main</span>}
              {p.status === "rejected" && <span className="small" style={{ position: "absolute", inset: "auto 6px 6px", background: "#fff", borderRadius: 8, padding: 4, color: "var(--red)" }}>Not allowed. Replace it.</span>}
              <button type="button" className="x" aria-label={`Remove photo ${pos}`} onClick={() => remove(p)}>×</button>
            </div>
          );
          return (
            <button key={pos} type="button" className="slot tip tip-r" data-tip={`Add photo ${pos}`} aria-label={`Add photo ${pos}`}
              onClick={() => choose(pos === firstFree ? pos : firstFree)} disabled={uploading !== null}>
              {uploading === pos ? <span className="spinner" /> :
                <svg width="24" height="24" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" aria-hidden="true"><path d="M12 5v14M5 12h14" /></svg>}
            </button>
          );
        })}
      </div>

      <section aria-label="Photo tips" className="card" style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 10, fontSize: 13 }}>
        {[["Clear face", true], ["Recent photos", true], ["Group-only", false], ["Celebrity or stock", false]].map(([t, ok]) => (
          <span key={String(t)} className="row" style={{ gap: 4 }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke={ok ? "#2F7D63" : "#C02660"} strokeWidth="2.6" aria-hidden="true">
              {ok ? <path d="M5 12l5 5L20 7" /> : <path d="M6 6l12 12M18 6L6 18" />}</svg>{t}
          </span>
        ))}
      </section>
      <span className="small">Every photo is checked for safety before others can see it.</span>

      <div className="grow" />
      <ErrorNote error={error} />
      <Primary onClick={submit} busy={busy} disabled={good < 2}>{good < 2 ? `Add ${2 - good} more photo${2 - good === 1 ? "" : "s"}` : `Continue with ${good} photos`}</Primary>
    </Screen>
  );
}

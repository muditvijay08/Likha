// One-off helper for testing: draws illustrated (clearly not photographic) portraits for seeded sample profiles
// (is_demo, no phone) that have no photos yet, and uploads two per profile. Internal only (x-likha-internal).
// Never runs for real members: it only touches is_demo profiles without a phone number.
import { Jimp } from "npm:jimp@1.6.0";
import { admin, isInternal, json } from "../_shared/db.ts";

type RGB = [number, number, number];
// [sky top, sky bottom, silhouette, accent]
const PALETTES: RGB[][] = [
  [[232, 69, 122], [255, 176, 32], [74, 30, 60], [255, 236, 200]],
  [[28, 20, 66], [120, 60, 160], [20, 12, 40], [255, 214, 120]],
  [[255, 140, 90], [255, 214, 160], [110, 40, 50], [255, 250, 230]],
  [[40, 110, 140], [140, 210, 200], [24, 50, 70], [255, 230, 170]],
  [[160, 40, 90], [240, 120, 140], [70, 16, 44], [255, 220, 150]],
  [[60, 40, 120], [230, 110, 140], [36, 20, 70], [255, 200, 120]],
  [[200, 90, 40], [250, 190, 110], [90, 36, 20], [255, 245, 215]],
  [[30, 80, 90], [210, 160, 90], [20, 40, 46], [255, 236, 190]],
];
const mix = (a: RGB, b: RGB, t: number): RGB => [0, 1, 2].map((i) => Math.round(a[i] + (b[i] - a[i]) * t)) as RGB;

async function draw(p: RGB[], variant: number): Promise<Uint8Array> {
  const W = 600, H = 750;
  const img = new Jimp({ width: W, height: H, color: 0x000000ff });
  const [top, bottom, sil, acc] = p;
  const disc = variant === 0 ? { x: 440, y: 170, r: 70 } : { x: 300, y: 250, r: 95 };
  img.scan(0, 0, W, H, (x, y, idx) => {
    let c = mix(top, bottom, y / H);
    if (variant === 1) {                                  // jharokha arch window behind the figure
      const inArch = x > 110 && x < 490 && y > 250 && y < 720 || (x - 300) ** 2 + (y - 250) ** 2 < 190 ** 2 && y <= 250;
      if (inArch) c = mix(c, acc, 0.35);
    }
    if ((x - disc.x) ** 2 + (y - disc.y) ** 2 < disc.r ** 2) c = mix(c, acc, 0.85);
    if ((x * 7 + y * 13) % 997 === 0 && y < 320) c = acc;   // a few stars
    const head = (x - 300) ** 2 + (y - 430) ** 2 < 92 ** 2;
    const bun = (x - 300) ** 2 + (y - 330) ** 2 < 46 ** 2;
    const shoulders = ((x - 300) / 240) ** 2 + ((y - 790) / 250) ** 2 < 1;
    const dupatta = variant === 0 && ((x - 230) / 70) ** 2 + ((y - 640) / 160) ** 2 < 1;
    if (head || bun || shoulders) c = sil;
    if (dupatta) c = mix(sil, acc, 0.45);
    img.bitmap.data[idx] = c[0]; img.bitmap.data[idx + 1] = c[1]; img.bitmap.data[idx + 2] = c[2]; img.bitmap.data[idx + 3] = 255;
  });
  return new Uint8Array(await img.getBuffer("image/jpeg", { quality: 85 }));
}

Deno.serve(async (req) => {
  if (!isInternal(req)) return json({ error: "internal only" }, 401);
  const { data: demo, error } = await admin.from("profiles").select("id, first_name").eq("is_demo", true);
  if (error) return json({ error: error.message }, 500);
  const done: string[] = [];
  for (const [i, p] of (demo ?? []).entries()) {
    const { data: u } = await admin.auth.admin.getUserById(p.id);
    if (u?.user?.phone) continue;                                   // a real test login: leave its photos alone
    const { count } = await admin.from("photos").select("id", { count: "exact", head: true }).eq("user_id", p.id);
    if ((count ?? 0) > 0) continue;
    for (const v of [0, 1]) {
      const path = `${p.id}/sample-${v + 1}.jpg`;
      const bytes = await draw(PALETTES[i % PALETTES.length], v);
      const up = await admin.storage.from("photos").upload(path, bytes, { contentType: "image/jpeg", upsert: true });
      if (up.error) return json({ error: up.error.message, at: p.first_name }, 500);
      const ins = await admin.from("photos").insert({ user_id: p.id, storage_path: path, position: v + 1, moderation_status: "approved",
        moderation_labels: { sample: true, illustration: true } });
      if (ins.error) return json({ error: ins.error.message, at: p.first_name }, 500);
    }
    done.push(p.first_name);
  }
  return json({ ok: true, illustrated: done });
});

"use client";
// M1 It's a match. Golden Hours: Venus and Moon horas for chats, Jupiter horas for a first date, never in Rahu Kaal.
// No prices here: the moment is for saying hi. More Golden Hours and openers live in the chat.
import Link from "next/link";
import { useParams } from "next/navigation";
import { useEffect, useMemo, useState } from "react";
import { motion, useReducedMotion } from "motion/react";
import { Avatar, useApp } from "@/components/app";
import { Badge, Button, NightSky } from "@/components/kit";
import { api, type MatchRow } from "@/lib/api";
import { BEST_FOR_LABEL, clockRange, goldenHours } from "@/lib/panchang";

export default function Match() {
  const { id } = useParams<{ id: string }>();
  const { home } = useApp();
  const reduce = useReducedMotion();
  const [m, setM] = useState<MatchRow | null | undefined>(undefined);
  useEffect(() => {
    api().matches().then((all) => setM(all.find((x) => x.match_id === id) ?? null)).catch(() => setM(null));
  }, [id]);

  const city = home?.city;
  const hours = useMemo(() => city ? goldenHours(city.lat, city.lng, city.timezone, new Date(), 7) : [], [city]);
  const tz = city?.timezone ?? "Asia/Kolkata";
  const first = hours[0];

  if (m === null) return <div className="app-body"><div className="empty card"><strong>This match isn&apos;t available any more.</strong><Link className="btn" href="/matches">Back to Chats</Link></div></div>;
  if (!m || !home) return <div className="app-body"><div className="skel" style={{ height: 420 }} /></div>;

  return (
    <NightSky className="min-h-dvh" seed={m.first_name.length + 21}>
      <div className="app-body" style={{ background: "transparent", padding: "28px 24px calc(100px + env(safe-area-inset-bottom))", gap: 20, minHeight: "100dvh" }}>
        <div className="flex flex-col items-center gap-4 pt-6 text-center">
          <div className="relative flex h-[132px] w-[236px] items-center justify-center" aria-hidden="true">
            <motion.div className="absolute left-0" initial={reduce ? false : { x: -40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}>
              <Avatar name={home.first_name} size={116} ring="var(--star)" />
            </motion.div>
            <motion.div className="absolute right-0" initial={reduce ? false : { x: 40, opacity: 0 }} animate={{ x: 0, opacity: 1 }} transition={{ duration: 0.8, ease: [0.2, 0.7, 0.2, 1] }}>
              <Avatar name={m.first_name} photo={m.photo} size={116} ring="#FF8A4C" />
            </motion.div>
            <motion.span className="relative z-10 flex h-11 w-11 items-center justify-center rounded-full bg-action text-ink shadow-lg"
              initial={reduce ? false : { scale: 0 }} animate={{ scale: 1 }} transition={{ delay: 0.7, type: "spring", stiffness: 260, damping: 14 }}>
              <svg width="22" height="22" viewBox="0 0 24 24" fill="#fff"><path d="M12 20s-7-4.4-7-10a4 4 0 0 1 7-2.6A4 4 0 0 1 19 10c0 5.6-7 10-7 10z" /></svg>
            </motion.span>
          </div>
          <h1 className="m-0 font-serif text-[32px] font-[560] leading-[1.12] text-white">You both said yes.<br />Ab baat karo!</h1>
          <div className="flex flex-wrap justify-center gap-2">
            {m.gunas != null && <Badge tone="gold" className="bg-[var(--star)] text-night">{m.gunas} of 36 Gunas</Badge>}
            {m.jodi_score != null && <Badge tone="night">Jodi Score {m.jodi_score}</Badge>}
          </div>
        </div>

        {first && (
          <section aria-label="Golden Hours" className="flex flex-col gap-1.5 rounded-[20px] border border-white/15 bg-white/8 px-4 py-3.5">
            <span className="font-sans text-xs font-bold tracking-[.1em] text-[var(--star)]">A GOOD TIME TO SAY HI</span>
            <strong className="font-sans text-[17px] text-white">{first.day} · {clockRange(first.start, first.end, tz)}</strong>
            <span className="font-sans text-[13px] text-[#D8D2CB]">{BEST_FOR_LABEL[first.best_for]} in {city?.name}. More Golden Hours are in your chat.</span>
          </section>
        )}

        <div className="grow" />
        <div className="flex flex-col gap-2.5">
          <Button asChild><Link href={`/chat/${m.match_id}`}>Say hi to {m.first_name}</Link></Button>
          <Button asChild variant="night" size="md" className="w-full"><Link href={`/chat/${m.match_id}?opener=1`}>Stuck? Get an opener idea</Link></Button>
          <Link href={`/share-date?match=${m.match_id}`} className="pt-1 text-center font-sans text-xs text-[#D8D2CB] hover:text-white">Share date with a friend</Link>
        </div>
      </div>
    </NightSky>
  );
}

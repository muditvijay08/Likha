"use client";
// Likha design kit: shadcn/ui-style primitives (Radix Slot + class-variance-authority + Tailwind) in Likha's own tokens,
// plus the signature pieces: the Guna ring, the night sky and the moon portrait. Motion is used for three moments only:
// the kundli drawing itself, the Guna count-up and the match. Everything respects prefers-reduced-motion.
import { Slot } from "@radix-ui/react-slot";
import { cva, type VariantProps } from "class-variance-authority";
import { animate, motion, useMotionValue, useReducedMotion, useTransform } from "motion/react";
import { forwardRef, useEffect, useMemo, type ButtonHTMLAttributes, type ReactNode } from "react";
import { cn } from "@/lib/cn";

// ---------------------------------------------------------------- Button (shadcn/ui pattern)
export const buttonVariants = cva(
  "inline-flex items-center justify-center gap-2 whitespace-nowrap font-sans font-bold no-underline transition-colors focus-visible:outline-3 focus-visible:outline-offset-2 focus-visible:outline-action disabled:opacity-55 disabled:cursor-not-allowed",
  {
    variants: {
      variant: {
        action: "bg-action text-action-ink hover:bg-[var(--action-hover)] hover:text-action-ink",
        outline: "bg-card text-ink border border-line hover:border-[#D9CFBE] hover:text-ink",
        night: "bg-white/10 text-white border border-white/20 hover:bg-white/15 hover:text-white",
        gold: "bg-gold text-white hover:brightness-95 hover:text-white",
        quiet: "bg-transparent text-muted hover:text-ink",
      },
      size: { lg: "h-14 w-full rounded-2xl text-base", md: "h-12 rounded-xl px-5 text-[15px]", sm: "h-9 rounded-lg px-3 text-sm" },
    },
    defaultVariants: { variant: "action", size: "lg" },
  },
);
export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement>, VariantProps<typeof buttonVariants> { asChild?: boolean }
export const Button = forwardRef<HTMLButtonElement, ButtonProps>(({ className, variant, size, asChild, ...props }, ref) => {
  const Comp = asChild ? Slot : "button";
  return <Comp ref={ref} className={cn(buttonVariants({ variant, size }), className)} {...props} />;
});
Button.displayName = "Button";

// ---------------------------------------------------------------- Badge
export const badgeVariants = cva("inline-flex items-center gap-1 rounded-full font-sans font-bold leading-none", {
  variants: {
    tone: { gold: "bg-gold-soft text-[#6E4E10]", action: "bg-action-soft text-[var(--g-ink)]", good: "bg-good-soft text-[#1F5E49]",
            line: "bg-card text-ink border border-line", night: "bg-white/12 text-white", sample: "bg-ink text-star" },
    size: { sm: "px-2 py-1 text-[11px]", md: "px-2.5 py-1.5 text-xs" },
  },
  defaultVariants: { tone: "line", size: "md" },
});
export function Badge({ tone, size, className, children }: VariantProps<typeof badgeVariants> & { className?: string; children: ReactNode }) {
  return <span className={cn(badgeVariants({ tone, size }), className)}>{children}</span>;
}

// ---------------------------------------------------------------- Night sky (a calm, deterministic star field)
export function NightSky({ className, children, seed = 7 }: { className?: string; children?: ReactNode; seed?: number }) {
  const stars = useMemo(() => {
    let x = seed * 9301 + 49297;
    const r = () => ((x = (x * 9301 + 49297) % 233280) / 233280);
    return Array.from({ length: 42 }, () => ({ l: r() * 100, t: r() * 100, s: r() < 0.15 ? 2.5 : r() < 0.5 ? 1.6 : 1, o: 0.35 + r() * 0.6 }));
  }, [seed]);
  return (
    <div className={cn("relative overflow-hidden bg-night text-white", className)}
      style={{ backgroundImage: "radial-gradient(120% 70% at 50% 0%, #2E2464 0%, var(--night-2) 38%, var(--night) 100%)" }}>
      <div aria-hidden="true" className="pointer-events-none absolute inset-0">
        {stars.map((s, i) => (
          <span key={i} className="absolute rounded-full bg-[var(--star)]" style={{ left: `${s.l}%`, top: `${s.t}%`, width: s.s, height: s.s, opacity: s.o }} />
        ))}
      </div>
      <div className="relative">{children}</div>
    </div>
  );
}

// ---------------------------------------------------------------- Guna ring with count-up
export function GunaRing({ gunas, size = 112, tone = "paper", label = true }: { gunas: number; size?: number; tone?: "paper" | "night"; label?: boolean }) {
  const reduce = useReducedMotion();
  const v = useMotionValue(reduce ? gunas : 0);
  const shown = useTransform(v, (n) => (Number.isInteger(gunas) ? Math.round(n) : Math.round(n * 2) / 2).toString());
  const dash = useTransform(v, (n) => `${(n / 36) * 289} 289`);
  useEffect(() => { if (reduce) { v.set(gunas); return; } const c = animate(v, gunas, { duration: 1.4, ease: [0.2, 0.7, 0.2, 1] }); return () => c.stop(); }, [gunas, reduce, v]);
  const ink = tone === "night" ? "#FFFFFF" : "var(--ink)";
  return (
    <svg width={size} height={size} viewBox="0 0 112 112" role="img" aria-label={`${gunas} of 36 Gunas`}>
      <circle cx="56" cy="56" r="46" fill="none" stroke={tone === "night" ? "rgba(255,255,255,.14)" : "var(--track)"} strokeWidth="8" />
      <motion.circle cx="56" cy="56" r="46" fill="none" stroke="var(--gold)" strokeWidth="8" strokeLinecap="round"
        transform="rotate(-90 56 56)" style={{ strokeDasharray: dash }} />
      <motion.text x="56" y={label ? 58 : 64} textAnchor="middle" fill={ink} style={{ font: "560 32px var(--serif)" }}>{shown}</motion.text>
      {label && <text x="56" y="77" textAnchor="middle" fill={tone === "night" ? "#CFC6F2" : "var(--muted)"} style={{ font: "700 10px var(--sans)", letterSpacing: ".08em" }}>OF 36 GUNAS</text>}
    </svg>
  );
}

// ---------------------------------------------------------------- Moon portrait: shown when there is no photo. Clearly not a face.
const SIGN_ORDER = ["Aries", "Taurus", "Gemini", "Cancer", "Leo", "Virgo", "Libra", "Scorpio", "Sagittarius", "Capricorn", "Aquarius", "Pisces"];
export function MoonPortrait({ name, moonSign, className, children }: { name: string; moonSign?: string | null; className?: string; children?: ReactNode }) {
  const seed = [...name].reduce((a, c) => a + c.charCodeAt(0), 0) + Math.max(0, SIGN_ORDER.indexOf(moonSign ?? ""));
  const phase = (seed % 7) / 7;                                    // just a look: crescent to gibbous
  return (
    <NightSky seed={seed} className={cn("flex items-center justify-center", className)}>
      <div className="flex flex-col items-center gap-3 py-6">
        <svg width="132" height="132" viewBox="0 0 132 132" aria-hidden="true">
          <defs><radialGradient id={`m${seed}`} cx="40%" cy="35%"><stop offset="0" stopColor="#FFF4D6" /><stop offset="1" stopColor="#E8C46E" /></radialGradient>
            <mask id={`k${seed}`}><rect width="132" height="132" fill="#fff" /><circle cx={66 + 30 + phase * 40} cy="58" r="44" fill="#000" /></mask></defs>
          <circle cx="66" cy="66" r="48" fill="rgba(244,213,141,.08)" />
          <circle cx="66" cy="66" r="40" fill={`url(#m${seed})`} mask={`url(#k${seed})`} />
          <text x="66" y="78" textAnchor="middle" fill="rgba(255,255,255,.92)" style={{ font: "560 34px var(--serif)" }}>{name.slice(0, 1).toUpperCase()}</text>
        </svg>
        {moonSign && <span className="font-sans text-xs font-bold tracking-[.12em] text-[#CFC6F2]">{moonSign.toUpperCase()} MOON</span>}
      </div>
      {children}
    </NightSky>
  );
}

// ---------------------------------------------------------------- Rise: a gentle entrance from a visible resting state
export function Rise({ children, delay = 0, className }: { children: ReactNode; delay?: number; className?: string }) {
  const reduce = useReducedMotion();
  return (
    <motion.div className={className} initial={reduce ? false : { opacity: 0.001, y: 10 }} animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.45, delay, ease: [0.2, 0.7, 0.2, 1] }}>{children}</motion.div>
  );
}

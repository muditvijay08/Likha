// Match Intelligence: real-life fit between two members, kept separate from the kundli (Gunas and the Jodi Score).
// Pure and deterministic: it compares only what each person chose to share on their profile, says "not known yet" for
// anything missing, never guesses, and never looks at religion or caste. Same code in demo mode and on the live backend.

export interface Life {
  drinking: string | null; smoking: string | null; kids: string | null; relocate: string | null; marriage_timeline: string | null;
  languages: string[]; hometown: string | null; workout: string | null;
  family_setup: string | null; career_plan: string | null; comm_style: string | null; conflict_style: string | null;
  weekend_style: string | null; money_style: string | null; life_values: string[];
}
export interface Side { first_name: string; goal: string | null; diet: string | null; city: string | null; interests: string[]; life?: Partial<Life> | null }

export type Status = "align" | "talk" | "differ" | "unknown";
export type Weight = "big" | "everyday";
export interface Item {
  key: string; area: string; weight: Weight; status: Status;
  /** one plain sentence, written from "you" to the member */
  text: string;
  /** what each side shared, for the detail line; null when not shared */
  mine: string | null; theirs: string | null;
  /** when unknown: who hasn't shared it */
  missing?: "me" | "them" | "both";
}
export interface Intel {
  items: Item[]; counts: Record<Status, number>; shared: number; total: number;
  verdict: "strong" | "mixed" | "big_differences" | "too_early";
  headline: string; myMissing: string[];
}

// ------------------------------------------------------------------ labels (also used by the Life and values screen)
export const LABELS: Record<string, Record<string, string>> = {
  goal: { dating: "dating with intent", matchmaking: "marriage-minded matchmaking" },
  marriage_timeline: { within_1y: "within a year", "1_2y": "in 1–2 years", not_sure: "when it feels right" },
  kids: { want: "wants kids", dont_want: "doesn't want kids", have: "has kids", not_sure: "not sure about kids" },
  family_setup: { joint: "a joint family", nuclear: "a nuclear family", open: "open to either" },
  career_plan: { both_work: "both keep working", one_home: "one of us at home", open: "whatever works for us" },
  relocate: { yes: "open to moving", maybe: "might move", no: "staying put" },
  diet: { vegetarian: "vegetarian", jain: "Jain", eggetarian: "eggetarian", non_veg: "non-vegetarian", vegan: "vegan" },
  drinking: { never: "doesn't drink", socially: "drinks socially", regularly: "drinks regularly" },
  smoking: { never: "doesn't smoke", socially: "smokes socially", regularly: "smokes regularly" },
  workout: { daily: "works out daily", often: "works out often", sometimes: "works out sometimes", never: "doesn't work out" },
  comm_style: { texter: "texting", caller: "calls", in_person: "meeting in person" },
  conflict_style: { talk_now: "talk it out straight away", cool_off: "cool off first, then talk" },
  weekend_style: { homebody: "quiet weekends at home", social: "weekends with people", outdoors: "weekends outdoors", mix: "a bit of everything" },
  money_style: { saver: "a saver", spender: "a spender", balanced: "balanced with money" },
  life_values: { family: "family", faith: "faith", ambition: "ambition", adventure: "adventure", stability: "stability", kindness: "kindness",
                 independence: "independence", humour: "humour", tradition: "tradition", growth: "growth" },
};
// the same answers in the first person, for sentences that start with "you"
const ME: Record<string, Record<string, string>> = {
  kids: { want: "want kids", dont_want: "don't want kids", have: "have kids", not_sure: "aren't sure about kids" },
  drinking: { never: "don't drink", socially: "drink socially", regularly: "drink regularly" },
  smoking: { never: "don't smoke", socially: "smoke socially", regularly: "smoke regularly" },
  workout: { daily: "work out daily", often: "work out often", sometimes: "work out sometimes", never: "don't work out" },
};
const L = (k: string, v: string | null | undefined) => (v == null ? null : LABELS[k]?.[v] ?? v);
const M = (k: string, v: string) => ME[k]?.[v] ?? L(k, v)!;
const list = (xs: string[]) => (xs.length <= 1 ? xs.join("") : `${xs.slice(0, -1).join(", ")} and ${xs[xs.length - 1]}`);

// ------------------------------------------------------------------ the comparison
type Rule = (a: string, b: string, them: string) => { status: Exclude<Status, "unknown">; text: string };
const VEG = new Set(["vegetarian", "jain", "vegan"]);
const STEP: Record<string, string[]> = {
  drinking: ["never", "socially", "regularly"], smoking: ["never", "socially", "regularly"],
  workout: ["never", "sometimes", "often", "daily"], marriage_timeline: ["within_1y", "1_2y", "not_sure"],
};
const gap = (k: string, a: string, b: string) => Math.abs(STEP[k].indexOf(a) - STEP[k].indexOf(b));

const RULES: Record<string, { area: string; weight: Weight; rule: Rule }> = {
  goal: { area: "Intentions", weight: "big", rule: (a, b, t) => a === b
    ? { status: "align", text: `You're both here for ${L("goal", a)}.` }
    : { status: "talk", text: `You're here for ${L("goal", a)}; ${t} is here for ${L("goal", b)}. Worth saying out loud early.` } },
  marriage_timeline: { area: "Timeline", weight: "big", rule: (a, b, t) => a === b
    ? { status: "align", text: `You both hope to marry ${L("marriage_timeline", a)}.` }
    : gap("marriage_timeline", a, b) === 1 && a !== "not_sure" && b !== "not_sure"
      ? { status: "align", text: `Close on timing: you said ${L("marriage_timeline", a)}, ${t} said ${L("marriage_timeline", b)}.` }
      : { status: "talk", text: `Different pace: you said ${L("marriage_timeline", a)}, ${t} said ${L("marriage_timeline", b)}.` } },
  kids: { area: "Children", weight: "big", rule: (a, b, t) => {
    if (a === b && a !== "not_sure") return { status: "align", text: a === "want" ? "You both want kids someday." : a === "dont_want" ? "Neither of you wants kids." : "You both already have kids." };
    if ((a === "want" && b === "dont_want") || (a === "dont_want" && b === "want")) return { status: "differ", text: `Far apart on kids: you ${M("kids", a)}, ${t} ${L("kids", b)}. Talk about this one early.` };
    if (a === "have" || b === "have") return { status: "talk", text: `You ${M("kids", a)}; ${t} ${L("kids", b)}. A conversation to have kindly and early.` };
    return { status: "talk", text: `One of you isn't sure about kids yet. Easy to talk about, better before it matters.` };
  } },
  family_setup: { area: "Family life", weight: "big", rule: (a, b, t) => a === b || a === "open" || b === "open"
    ? { status: "align", text: a === b ? `You both see yourselves in ${L("family_setup", a)}.` : `One of you is open either way, so family set-up fits.` }
    : { status: "talk", text: `You picture ${L("family_setup", a)}, ${t} pictures ${L("family_setup", b)}. Families often ask about this, so talk first.` } },
  career_plan: { area: "Work after marriage", weight: "big", rule: (a, b, t) => a === b || a === "open" || b === "open"
    ? { status: "align", text: a === b ? `Same picture for work after marriage: ${L("career_plan", a)}.` : `One of you is flexible on work after marriage, so this fits.` }
    : { status: "talk", text: `You said "${L("career_plan", a)}", ${t} said "${L("career_plan", b)}". A practical talk to have early.` } },
  diet: { area: "Food at home", weight: "everyday", rule: (a, b, t) => {
    if (a === b) return { status: "align", text: `You're both ${L("diet", a)}.` };
    if (VEG.has(a) && VEG.has(b)) return { status: "align", text: `Close on food: you're ${L("diet", a)}, ${t} is ${L("diet", b)}.` };
    if ((a === "eggetarian" && VEG.has(b)) || (b === "eggetarian" && VEG.has(a)) || (a === "eggetarian" && b === "non_veg") || (b === "eggetarian" && a === "non_veg"))
      return { status: "talk", text: `Small food difference: you're ${L("diet", a)}, ${t} is ${L("diet", b)}.` };
    return { status: "talk", text: `You're ${L("diet", a)}, ${t} is ${L("diet", b)}. What's cooked at home is worth a chat.` };
  } },
  drinking: { area: "Drinking", weight: "big", rule: (a, b, t) => a === b
    ? { status: "align", text: a === "never" ? "Neither of you drinks." : `You both ${M("drinking", a)}.` }
    : { status: gap("drinking", a, b) === 2 ? "differ" : "talk", text: `${gap("drinking", a, b) === 2 ? "Far apart" : "A little apart"} on drinking: you ${M("drinking", a)}, ${t} ${L("drinking", b)}.` } },
  smoking: { area: "Smoking", weight: "big", rule: (a, b, t) => a === b
    ? { status: "align", text: a === "never" ? "Neither of you smokes." : `You both ${M("smoking", a)}.` }
    : { status: gap("smoking", a, b) === 2 ? "differ" : "talk", text: `${gap("smoking", a, b) === 2 ? "Far apart" : "A little apart"} on smoking: you ${M("smoking", a)}, ${t} ${L("smoking", b)}.` } },
  workout: { area: "Fitness", weight: "everyday", rule: (a, b, t) => gap("workout", a, b) <= 1
    ? { status: "align", text: `Similar energy: you ${M("workout", a)}, ${t} ${L("workout", b)}.` }
    : { status: "talk", text: `Different routines: you ${M("workout", a)}, ${t} ${L("workout", b)}.` } },
  comm_style: { area: "Staying in touch", weight: "everyday", rule: (a, b, t) => a === b
    ? { status: "align", text: `You both prefer ${L("comm_style", a)}.` }
    : { status: "talk", text: `You prefer ${L("comm_style", a)}, ${t} prefers ${L("comm_style", b)}. Easy to agree a rhythm.` } },
  conflict_style: { area: "Disagreements", weight: "everyday", rule: (a, b, t) => a === b
    ? { status: "align", text: `In a disagreement you both ${L("conflict_style", a)}.` }
    : { status: "talk", text: `You ${L("conflict_style", a)}; ${t} would rather ${L("conflict_style", b)}. Agree a pause rule early.` } },
  weekend_style: { area: "Weekends", weight: "everyday", rule: (a, b, t) => a === b || a === "mix" || b === "mix"
    ? { status: "align", text: a === b ? `You both like ${L("weekend_style", a)}.` : `Weekends fit: one of you likes a bit of everything.` }
    : { status: "talk", text: `You like ${L("weekend_style", a)}, ${t} likes ${L("weekend_style", b)}. Take turns.` } },
  money_style: { area: "Money", weight: "everyday", rule: (a, b, t) => a === b || a === "balanced" || b === "balanced"
    ? { status: "align", text: a === b ? `You're both ${({ saver: "savers", spender: "spenders", balanced: "balanced with money" } as Record<string, string>)[a]}.` : `Money styles fit: one of you is balanced.` }
    : { status: "talk", text: `You're ${L("money_style", a)}, ${t} is ${L("money_style", b)}. A good early chat, not a deal-breaker.` } },
};

function relocation(me: Side, them: Side): Item {
  const base = { key: "location", area: "Where you live", weight: "big" as Weight, mine: me.city, theirs: them.city };
  if (me.city && them.city && me.city === them.city) {
    const home = me.life?.hometown && them.life?.hometown && me.life.hometown === them.life.hometown ? ` Both from ${me.life.hometown}, too.` : "";
    return { ...base, status: "align", text: `You're both in ${me.city}.${home}` };
  }
  const a = me.life?.relocate ?? null, b = them.life?.relocate ?? null;
  if (!me.city || !them.city || (!a && !b)) return { ...base, status: "unknown", text: "Not enough shared yet to compare where you'd live.", missing: !a && !b ? "both" : !a ? "me" : "them" };
  if (a === "yes" || b === "yes") return { ...base, status: "align", text: `Different cities, but ${b === "yes" ? `${them.first_name} is` : "you're"} open to moving.`, mine: L("relocate", a), theirs: L("relocate", b) };
  if (a === "no" && b === "no") return { ...base, status: "differ", text: `You're in ${me.city}, ${them.first_name} is in ${them.city}, and neither of you wants to move.`, mine: L("relocate", a), theirs: L("relocate", b) };
  return { ...base, status: "talk", text: `Different cities, and moving is a maybe. Worth asking how you'd make it work.`, mine: L("relocate", a), theirs: L("relocate", b) };
}

function overlap(key: "interests" | "life_values" | "languages", area: string, mineList: string[], theirList: string[], them: string): Item {
  const base = { key, area, weight: "everyday" as Weight };
  const show = (xs: string[]) => (key === "life_values" ? xs.map((x) => L("life_values", x)!) : xs);
  if (!mineList.length || !theirList.length)
    return { ...base, status: "unknown", mine: mineList.length ? list(show(mineList)) : null, theirs: theirList.length ? list(show(theirList)) : null,
             missing: !mineList.length && !theirList.length ? "both" : !mineList.length ? "me" : "them",
             text: key === "life_values" ? "Values not shared yet." : key === "languages" ? "Languages not shared yet." : "Interests not shared yet." };
  const norm = (x: string) => x.trim().toLowerCase();
  const both = mineList.filter((x) => theirList.some((y) => norm(y) === norm(x)));
  const mine = list(show(mineList)), theirs = list(show(theirList));
  if (both.length) {
    const s = list(show(both));
    return { ...base, status: "align", mine, theirs, text: key === "life_values" ? `You both put ${s} first.` : key === "languages" ? `You both speak ${s}.` : `You both like ${s}.` };
  }
  return { ...base, status: "talk", mine, theirs,
    text: key === "life_values" ? `Different priorities: you chose ${mine}, ${them} chose ${theirs}. Ask why.`
      : key === "languages" ? `No language in common listed yet. Worth checking.` : `No shared interests yet: something new to try together.` };
}

export function compare(me: Side, them: Side): Intel {
  const t = them.first_name;
  const ml = me.life ?? {}, tl = them.life ?? {};
  const items: Item[] = [];
  const val = (s: Side, k: string): string | null => (k === "goal" ? s.goal : k === "diet" ? s.diet : ((s.life ?? {}) as Record<string, string | null>)[k] ?? null);
  for (const [key, r] of Object.entries(RULES)) {
    const a = val(me, key), b = val(them, key);
    const lk = key === "goal" ? "goal" : key;
    if (!a || !b) {
      items.push({ key, area: r.area, weight: r.weight, status: "unknown", mine: L(lk, a), theirs: L(lk, b),
        missing: !a && !b ? "both" : !a ? "me" : "them",
        text: !a && !b ? "Neither of you has shared this yet." : !a ? "You haven't shared this yet." : `${t} hasn't shared this yet.` });
      continue;
    }
    const out = r.rule(a, b, t);
    items.push({ key, area: r.area, weight: r.weight, ...out, mine: L(lk, a), theirs: L(lk, b) });
  }
  items.push(relocation(me, them));
  items.push(overlap("life_values", "Values", ml.life_values ?? [], tl.life_values ?? [], t));
  items.push(overlap("interests", "Interests", me.interests ?? [], them.interests ?? [], t));
  items.push(overlap("languages", "Languages", ml.languages ?? [], tl.languages ?? [], t));

  // big things first inside each group
  const order: Record<Status, number> = { align: 0, talk: 1, differ: 2, unknown: 3 };
  items.sort((x, y) => order[x.status] - order[y.status] || (x.weight === y.weight ? 0 : x.weight === "big" ? -1 : 1));
  const counts = { align: 0, talk: 0, differ: 0, unknown: 0 } as Record<Status, number>;
  for (const i of items) counts[i.status]++;
  const shared = items.length - counts.unknown;
  const bigDiffer = items.some((i) => i.status === "differ" && i.weight === "big");
  const verdict: Intel["verdict"] = shared < 5 ? "too_early" : bigDiffer ? "big_differences" : counts.align >= 2 * (counts.talk + counts.differ) ? "strong" : "mixed";
  const headline = {
    too_early: "Too early to say. Share a little more, and ask them to as well.",
    big_differences: "Some big differences to talk through first.",
    strong: "Strong real-life fit.",
    mixed: "A mixed picture. Worth a real conversation.",
  }[verdict];
  const myMissing = items.filter((i) => i.missing === "me" || i.missing === "both").map((i) => i.key);
  return { items, counts, shared, total: items.length, verdict, headline, myMissing };
}

/** One short line for a Discover card. */
export function summaryLine(x: Intel): string {
  if (x.verdict === "too_early") return "Real life: too early to say";
  const parts = [`${x.counts.align} line up`];
  if (x.counts.talk) parts.push(`${x.counts.talk} to talk about`);
  if (x.counts.differ) parts.push(`${x.counts.differ} differ`);
  return `Real life: ${parts.join(" · ")}`;
}

import type { Metadata } from "next";
import { Crumbs, Cta, Faq } from "@/components/site/chrome";

export const metadata: Metadata = {
  title: "Questions about Likha · Kundli-first dating",
  description: "Answers about Likha: what it costs, how kundli matching works, privacy of your birth details, safety, verification, Manglik, caste and city launches.",
  alternates: { canonical: "/faq" },
};

const ITEMS: [string, string][] = [
  ["Is Likha free?", "Yes. Making your kundli, liking, matching and chatting are free. Some extras, like detailed readings, Check With Anyone and Boost, use credits, and plans add more features. You always see the price before you pay."],
  ["Who can join?", "Anyone 18 or older with a mobile number, in a city where Likha is open. Other cities can join the Founding Members list."],
  ["Why do you need my birth time and place?", "To work out your real birth chart. The Moon changes nakshatra about once a day, and your ascendant every two hours, so the time matters. Your birth details are never shown to anyone."],
  ["What is the Jodi Score?", "Likha's compatibility score. It starts from the traditional 36-Guna Milan and adds other chart factors, so it tells two similar Guna totals apart."],
  ["Do you filter by caste or Manglik?", "No. Likha doesn't ask for caste or filter by it. Manglik status is shown on profiles because many families check it, but we never hide anyone because of it."],
  ["How do you check people are real?", "Everyone signs up with their own mobile number and takes a selfie at sign-up. Likha never creates fake profiles, and our safety team reviews every report."],
  ["What is Saathi?", "A virtual companion for practising conversations and talking things through. Saathi is always shown as a virtual companion, never as a real person or a match."],
  ["Can I hide my profile?", "Yes. Incognito shows you only to people you've liked. You can also hide your company, and women can choose to message first."],
  ["How do I delete my account?", "From Settings in the app, confirmed with a fresh login code. Your profile disappears and your data is erased within 30 days. Payment records are kept only as tax law requires."],
  ["When does my city open?", "Each city opens when it reaches its Founding Members. Join the list on our home page and we'll send you one SMS the day it opens."],
  ["Do you predict marriages or sell remedies?", "No. A good match is a good start, not a promise. Likha never predicts illness or misfortune and doesn't sell remedies, pujas or gemstones."],
];

export default function FaqPage() {
  return (
    <>
      <section><div className="wrap narrow">
        <Crumbs items={[["Likha", "/"], ["Questions"]]} />
        <h1>Questions</h1>
        <div style={{ marginTop: 24 }}><Faq items={ITEMS} /></div>
      </div></section>
      <Cta />
    </>
  );
}

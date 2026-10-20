// Pages that are designed but not in this build yet land here instead of a blank error.
import Link from "next/link";

export default function NotFound() {
  return (
    <main className="screen" style={{ justifyContent: "center", textAlign: "center" }}>
      <div className="wordmark">Likha<span>.</span></div>
      <h1 className="h1">This part is on its way</h1>
      <p className="sub">It&apos;s coming in the next update. Everything else works as usual.</p>
      <Link className="btn" href="/home">Back to Home</Link>
    </main>
  );
}

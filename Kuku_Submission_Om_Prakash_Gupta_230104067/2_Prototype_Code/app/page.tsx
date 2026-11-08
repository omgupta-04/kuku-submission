import fs from "node:fs";
import path from "node:path";
import Nav from "@/components/Nav";
import Run from "@/components/Run";
import Methodology from "@/components/Methodology";
import Results from "@/components/Results";

export default function Home() {
  const prompts = Object.fromEntries(
    ["tagger", "judge", "critic"].map((n) => [n, fs.readFileSync(path.join(process.cwd(), "prompts", `${n}.md`), "utf8")]),
  );
  return (
    <>
      <Nav />
      <div className="md:pl-60">
        <main className="mx-auto max-w-6xl px-5 md:px-12 lg:px-16">
          <Run />
          <Methodology prompts={prompts} />
          <Results />
          <footer className="border-t border-line py-8 text-xs text-muted">PromoFinder · finds promo clips, does not edit them · input scripts are confidential and not stored.</footer>
        </main>
      </div>
    </>
  );
}

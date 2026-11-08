"use client";
import { useEffect, useState } from "react";

const ITEMS = [
  { id: "run", label: "Run", hint: "Upload and analyze" },
  { id: "methodology", label: "Methodology", hint: "How it works" },
  { id: "results", label: "Results", hint: "50-episode run" },
];

function Mark() {
  return (
    <svg width="28" height="28" viewBox="0 0 28 28" aria-hidden="true">
      <rect width="28" height="28" rx="7" fill="var(--accent)" />
      <path d="M11 8.5v11l9-5.5-9-5.5z" fill="#fff" />
      <rect x="5" y="22" width="18" height="2" rx="1" fill="#fff" opacity=".55" />
    </svg>
  );
}

export default function Nav() {
  const [active, setActive] = useState("run");
  useEffect(() => {
    const io = new IntersectionObserver(
      (es) => es.forEach((e) => e.isIntersecting && setActive(e.target.id)),
      { rootMargin: "-40% 0px -55% 0px" },
    );
    ITEMS.forEach((i) => { const el = document.getElementById(i.id); if (el) io.observe(el); });
    return () => io.disconnect();
  }, []);
  return (
    <nav className="[scrollbar-width:none] [&::-webkit-scrollbar]:hidden sticky top-0 z-20 flex items-center gap-1 overflow-x-auto border-b border-line bg-paper/90 px-4 py-2.5 backdrop-blur md:fixed md:inset-y-0 md:left-0 md:w-60 md:flex-col md:items-stretch md:gap-1 md:overflow-visible md:border-b-0 md:border-r md:px-6 md:py-9">
      <a href="#run" className="mr-3 flex shrink-0 items-center gap-2.5 md:mb-10 md:mr-0">
        <Mark />
        <span className="text-[1.35rem] leading-none" style={{ fontFamily: "var(--font-display)" }}>PromoFinder</span>
      </a>
      {ITEMS.map((i, n) => (
        <a
          key={i.id}
          href={`#${i.id}`}
          aria-current={active === i.id ? "true" : undefined}
          className={`group flex shrink-0 items-center gap-3 rounded-lg px-3 py-2 text-sm transition-colors md:py-2.5 ${active === i.id ? "bg-sunk text-ink" : "text-muted hover:bg-sunk/60 hover:text-ink"}`}
        >
          <span className={`font-mono text-[11px] ${active === i.id ? "text-accent" : "text-muted"}`}>0{n + 1}</span>
          <span className="flex flex-col leading-tight">
            <span className={active === i.id ? "font-semibold" : "font-medium"}>{i.label}</span>
            <span className="hidden text-[11px] text-muted md:block">{i.hint}</span>
          </span>
        </a>
      ))}
      <p className="mt-auto hidden px-3 text-[11px] leading-relaxed text-muted md:block">Finds promo clips. Does not cut, caption or score video.</p>
    </nav>
  );
}

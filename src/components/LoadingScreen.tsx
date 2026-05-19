import { useEffect, useRef, useState } from "react";

const MIN_DISPLAY_MS = 1800;

export function LoadingScreen({ visible }: { visible: boolean }) {
  const [mounted, setMounted] = useState(true);
  const [fading, setFading] = useState(false);
  const showSince = useRef(Date.now());

  useEffect(() => {
    if (!visible) {
      const elapsed = Date.now() - showSince.current;
      const delay = Math.max(0, MIN_DISPLAY_MS - elapsed);
      const fadeTimer = setTimeout(() => setFading(true), delay);
      const unmountTimer = setTimeout(() => setMounted(false), delay + 650);
      return () => {
        clearTimeout(fadeTimer);
        clearTimeout(unmountTimer);
      };
    }
  }, [visible]);

  if (!mounted) return null;

  return (
    <div
      className="fixed inset-0 z-[100] flex items-center justify-center bg-background"
      style={{
        transition: "opacity 0.65s cubic-bezier(0.4, 0, 0.2, 1)",
        opacity: fading ? 0 : 1,
        pointerEvents: fading ? "none" : "auto",
      }}
    >
      {/* Ambient background glow */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[520px] h-[520px] rounded-full blur-[120px] pointer-events-none animate-loading-bg-pulse"
        style={{ background: "var(--color-primary)", opacity: 0.07 }}
      />
      <div
        className="absolute top-1/3 left-1/4 w-64 h-64 rounded-full blur-[80px] pointer-events-none animate-loading-bg-drift"
        style={{ background: "var(--color-primary)", opacity: 0.04 }}
      />

      {/* Main content */}
      <div className="relative flex flex-col items-center gap-12 animate-fade-in-up">

        {/* Spinner assembly */}
        <div className="relative w-48 h-48 flex items-center justify-center">

          {/* Outer ring — slow clockwise */}
          <svg
            className="absolute inset-0 w-full h-full animate-loading-spin-outer"
            viewBox="0 0 192 192"
            fill="none"
          >
            <defs>
              <linearGradient id="ls-grad-outer" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" style={{ stopColor: "var(--color-primary)", stopOpacity: 0 }} />
                <stop offset="45%" style={{ stopColor: "var(--color-primary)", stopOpacity: 0.9 }} />
                <stop offset="100%" style={{ stopColor: "var(--color-primary)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <circle cx="96" cy="96" r="90" stroke="currentColor" strokeWidth="1.5" className="text-primary/10" />
            <circle
              cx="96" cy="96" r="90"
              stroke="url(#ls-grad-outer)"
              strokeWidth="2.5"
              strokeDasharray="128 437"
              strokeLinecap="round"
            />
          </svg>

          {/* Middle ring — faster counter-clockwise */}
          <svg
            className="absolute animate-loading-spin-middle"
            style={{ width: 140, height: 140 }}
            viewBox="0 0 140 140"
            fill="none"
          >
            <defs>
              <linearGradient id="ls-grad-middle" x1="0%" y1="0%" x2="100%" y2="100%">
                <stop offset="0%" style={{ stopColor: "var(--color-ring)", stopOpacity: 0 }} />
                <stop offset="40%" style={{ stopColor: "var(--color-ring)", stopOpacity: 1 }} />
                <stop offset="100%" style={{ stopColor: "var(--color-ring)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <circle cx="70" cy="70" r="64" stroke="currentColor" strokeWidth="1" className="text-primary/10" />
            <circle
              cx="70" cy="70" r="64"
              stroke="url(#ls-grad-middle)"
              strokeWidth="3"
              strokeDasharray="90 312"
              strokeLinecap="round"
            />
          </svg>

          {/* Inner ring — medium clockwise */}
          <svg
            className="absolute animate-loading-spin-inner"
            style={{ width: 96, height: 96 }}
            viewBox="0 0 96 96"
            fill="none"
          >
            <defs>
              <linearGradient id="ls-grad-inner" x1="100%" y1="0%" x2="0%" y2="100%">
                <stop offset="0%" style={{ stopColor: "var(--color-primary)", stopOpacity: 0 }} />
                <stop offset="50%" style={{ stopColor: "var(--color-primary)", stopOpacity: 0.75 }} />
                <stop offset="100%" style={{ stopColor: "var(--color-primary)", stopOpacity: 0 }} />
              </linearGradient>
            </defs>
            <circle cx="48" cy="48" r="42" stroke="currentColor" strokeWidth="1" className="text-primary/10" />
            <circle
              cx="48" cy="48" r="42"
              stroke="url(#ls-grad-inner)"
              strokeWidth="2"
              strokeDasharray="56 208"
              strokeLinecap="round"
            />
          </svg>

          {/* Center orb */}
          <div className="relative w-16 h-16">
            <div
              className="absolute inset-0 rounded-full blur-xl animate-loading-orb-pulse"
              style={{ background: "var(--color-primary)", opacity: 0.3 }}
            />
            <div
              className="absolute -inset-4 rounded-full blur-3xl animate-loading-orb-pulse"
              style={{ background: "var(--color-primary)", opacity: 0.1, animationDelay: "0.9s" }}
            />
            <div className="relative w-full h-full rounded-full glass border-primary/30 flex items-center justify-center"
              style={{
                boxShadow:
                  "0 0 28px rgba(59,130,246,0.28), inset 0 1px 0 rgba(255,255,255,0.18)",
              }}
            >
              <div
                className="w-6 h-6 rounded-full animate-loading-orb-pulse"
                style={{
                  background: "var(--color-primary)",
                  boxShadow: "0 0 16px var(--color-primary)",
                  animationDelay: "0.45s",
                }}
              />
            </div>
          </div>
        </div>

        {/* Labels */}
        <div className="flex flex-col items-center gap-3">
          <span className="text-sm font-semibold tracking-[0.24em] uppercase text-foreground/65">
            AureStream
          </span>
          <div className="flex items-center gap-2.5">
            <span className="text-sm text-muted-foreground/80">正在初始化</span>
            <div className="flex gap-1.5">
              {[0, 160, 320].map((delay) => (
                <span
                  key={delay}
                  className="block w-1.5 h-1.5 rounded-full animate-bounce"
                  style={{
                    background: "var(--color-primary)",
                    opacity: 0.55,
                    animationDelay: `${delay}ms`,
                  }}
                />
              ))}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

import { Outlet } from "react-router-dom"

export default function AuthLayout() {
  return (
    <div className="relative flex h-full w-full flex-col overflow-hidden font-sans">
      {/* Soft mobile-app mesh background */}
      <div
        aria-hidden
        className="pointer-events-none absolute inset-0 z-0 bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary)/0.18),transparent_42%),radial-gradient(circle_at_90%_18%,rgba(165,243,252,0.22),transparent_36%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--card))_55%,hsl(var(--background))_100%)] dark:bg-[radial-gradient(circle_at_20%_0%,hsl(var(--primary)/0.22),transparent_46%),radial-gradient(circle_at_90%_20%,rgba(108,92,255,0.12),transparent_40%),linear-gradient(180deg,hsl(var(--background))_0%,hsl(var(--card))_60%,hsl(var(--background))_100%)]"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -left-16 top-24 h-48 w-48 rounded-full bg-primary/10 blur-3xl"
      />
      <div
        aria-hidden
        className="pointer-events-none absolute -right-12 top-[42%] h-56 w-56 rounded-full bg-cyan-300/15 blur-3xl dark:bg-primary/10"
      />

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}

import { Outlet } from "react-router-dom"

/** Thin shell — each page owns its chrome (top bar / layout). */
export default function AppShell() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden bg-white dark:bg-background">
      <Outlet />
    </div>
  )
}

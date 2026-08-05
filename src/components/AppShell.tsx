import { Outlet } from "react-router-dom"

/** Thin shell — each page owns its chrome (top bar / layout). */
export default function AppShell() {
  return (
    <div className="flex h-full min-h-0 w-full flex-1 flex-col overflow-hidden bg-white dark:bg-background">
      <div className="flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}

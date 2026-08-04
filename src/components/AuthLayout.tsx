import { Outlet } from "react-router-dom"

export default function AuthLayout() {
  return (
    <div className="flex h-full w-full flex-col overflow-hidden font-sans">
      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}

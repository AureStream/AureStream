import { Routes, Route } from "react-router-dom"
import MobileHome from "./MobileHome"
import NodesPage from "./NodesPage"
import ProfilePage from "./ProfilePage"
import AboutPage from "./AboutPage"

/* ================================================================
   Mobile shell — thin wrapper around the nested page routes.
   ================================================================ */
export default function Dashboard() {
  return (
    <div className="h-full w-full flex flex-col relative bg-[#F4F7F6] dark:bg-[#0D131A] overflow-hidden">
      <div className="absolute inset-0 app-network-background pointer-events-none z-0" />
      <div className="absolute inset-0 app-network-background-overlay pointer-events-none z-0" />

      <div className="relative z-10 flex flex-col h-full flex-1 min-w-0">
        <main className="flex-1 overflow-hidden overflow-x-hidden no-scrollbar">
          <Routes>
            <Route index element={<MobileHome />} />
            <Route path="nodes" element={<NodesPage />} />
            <Route path="about" element={<AboutPage />} />
            <Route path="profile" element={<ProfilePage />} />
          </Routes>
        </main>
      </div>
    </div>
  )
}

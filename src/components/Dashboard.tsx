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
      {/* Dynamic Modern Wallpaper Mesh Backdrop */}
      <div className="absolute inset-0 pointer-events-none z-0 overflow-hidden">
        <div className="absolute -top-24 -right-24 w-96 h-96 bg-gradient-to-br from-[#00BBA7]/15 via-teal-300/10 to-transparent rounded-full blur-3xl opacity-70" />
        <div className="absolute top-1/3 -left-20 w-80 h-80 bg-gradient-to-tr from-cyan-400/10 via-[#00BBA7]/10 to-transparent rounded-full blur-3xl opacity-60" />
        <div className="absolute -bottom-24 right-1/4 w-96 h-96 bg-gradient-to-t from-[#00BBA7]/15 via-emerald-200/10 to-transparent rounded-full blur-3xl opacity-65" />
      </div>

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
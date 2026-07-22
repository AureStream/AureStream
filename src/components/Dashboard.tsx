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
    <div className="h-full w-full flex flex-col relative overflow-hidden">
      <div className="relative flex flex-col h-full flex-1 min-w-0">
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

import { Outlet } from "react-router-dom"
import { useTranslation } from "react-i18next"

export default function AuthLayout() {
  const { i18n } = useTranslation()

  return (
    <div className="flex h-full w-full flex-col overflow-hidden font-sans">
      <div className="absolute right-4 top-4 z-20 flex items-center gap-3">
        <div className="flex rounded-2xl border border-border-glass bg-surface/35 p-1 shadow-glass backdrop-blur-xl">
          <button
            onClick={() => i18n.changeLanguage("zh")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${i18n.language.startsWith("zh") ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
          >
            中文
          </button>
          <button
            onClick={() => i18n.changeLanguage("en")}
            className={`rounded-xl px-3.5 py-1.5 text-xs font-bold transition-all ${!i18n.language.startsWith("zh") ? "glass-active-pill" : "text-text-muted hover:text-text"}`}
          >
            EN
          </button>
        </div>
      </div>

      <div className="relative z-10 flex min-h-0 flex-1 flex-col">
        <Outlet />
      </div>
    </div>
  )
}

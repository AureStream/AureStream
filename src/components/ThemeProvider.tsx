import { createContext, useContext, useEffect, type ReactNode } from "react"

type Theme = "light" | "dark"
export type ThemeMode = "light" | "dark" | "system"

interface ThemeContextType {
  /** Resolved theme actually applied to the UI. */
  theme: Theme
  /** User-selected mode (kept for API compatibility; always light). */
  mode: ThemeMode
  setMode: (mode: ThemeMode) => void
  /** Explicit light/dark toggle (no-op — app is light-only). */
  toggleTheme: () => void
}

const ThemeContext = createContext<ThemeContextType>({
  theme: "light",
  mode: "light",
  setMode: () => {},
  toggleTheme: () => {},
})

export function useTheme() {
  return useContext(ThemeContext)
}

/**
 * Light-only theme. The app always renders in light mode — the OS preference
 * and any previously saved mode are ignored. The `data-theme="light"` attribute
 * (which the dark CSS variant keys off of) is pinned on mount so `[data-theme="dark"]`
 * rules never apply.
 */
export function ThemeProvider({ children }: { children: ReactNode }) {
  useEffect(() => {
    document.documentElement.setAttribute("data-theme", "light")
  }, [])

  return (
    <ThemeContext.Provider value={{ theme: "light", mode: "light", setMode: () => {}, toggleTheme: () => {} }}>
      {children}
    </ThemeContext.Provider>
  )
}
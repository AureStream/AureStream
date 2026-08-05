import { NavLink, Outlet } from "react-router-dom";

const NAV = [
  { to: "/", label: "首页", end: true },
  { to: "/nodes", label: "节点", end: false },
  { to: "/profile", label: "我的", end: false },
] as const;

export default function AppShell() {
  return (
    <div className="app-shell">
      <header className="app-shell-header">
        <p className="app-shell-brand">AureStream</p>
      </header>

      <main className="app-shell-main">
        <Outlet />
      </main>

      <nav className="app-shell-nav" aria-label="主导航">
        {NAV.map((item) => (
          <NavLink
            key={item.to}
            to={item.to}
            end={item.end}
            className={({ isActive }) =>
              isActive ? "app-shell-nav-link is-active" : "app-shell-nav-link"
            }
          >
            {item.label}
          </NavLink>
        ))}
      </nav>
    </div>
  );
}

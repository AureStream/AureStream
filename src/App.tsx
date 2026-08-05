import { BrowserRouter, Link, Route, Routes } from "react-router-dom";
import LoginPage from "@/components/LoginPage";
import RegisterPage from "@/components/RegisterPage";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";

function HomePage() {
  const { user, logout, authLoading } = useAuth();

  return (
    <div className="home-page">
      <h1 className="home-brand">AureStream</h1>
      <p className="home-subtitle">事件驱动首页（无鉴权门闸）</p>
      {user ? (
        <div className="home-session">
          <p>
            已登录：<strong>{user.email}</strong>
          </p>
          <button
            className="auth-btn"
            type="button"
            disabled={authLoading}
            onClick={() => void logout()}
          >
            {authLoading ? "退出中…" : "退出登录"}
          </button>
        </div>
      ) : (
        <div className="home-session">
          <p>当前未登录</p>
          <div className="home-links">
            <Link className="auth-link" to="/login">
              登录
            </Link>
            <Link className="auth-link" to="/register">
              注册
            </Link>
          </div>
        </div>
      )}
    </div>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<HomePage />} />
          <Route path="/login" element={<LoginPage />} />
          <Route path="/register" element={<RegisterPage />} />
        </Routes>
      </BrowserRouter>
    </AuthProvider>
  );
}

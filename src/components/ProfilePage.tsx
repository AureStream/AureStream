import { useAuth } from "@/contexts/AuthContext";
import { useSubs } from "@/contexts/SubsContext";

function formatExpire(expireTime: number): string {
  if (!expireTime || expireTime <= 0) return "未设置";
  const ms = expireTime < 1e12 ? expireTime * 1000 : expireTime;
  try {
    return new Date(ms).toLocaleDateString("zh-CN");
  } catch {
    return "—";
  }
}

export default function ProfilePage() {
  const { user, authLoading, logout } = useAuth();
  const { subscriptions, activeId, nodes, syncing } = useSubs();
  const active = subscriptions.find((s) => s.id === activeId) ?? subscriptions[0];

  return (
    <section className="page profile">
      <header className="page-header">
        <h1 className="page-title">我的</h1>
        <p className="page-subtitle">账号与订阅概览</p>
      </header>

      <div className="profile-block">
        <p className="profile-label">邮箱</p>
        <p className="profile-value">{user?.email ?? "—"}</p>
      </div>

      <div className="profile-block">
        <p className="profile-label">订阅</p>
        {subscriptions.length === 0 ? (
          <p className="home-inline-sync">订阅同步中</p>
        ) : (
          <>
            <p className="profile-value">{active?.name ?? "已同步"}</p>
            <p className="profile-meta">
              {subscriptions.length} 个订阅 · {nodes.length} 个节点
              {active ? ` · 到期 ${formatExpire(active.expireTime)}` : ""}
              {syncing ? " · 刷新中" : ""}
            </p>
          </>
        )}
      </div>

      <button
        className="auth-btn-secondary profile-logout"
        type="button"
        disabled={authLoading}
        onClick={() => void logout()}
      >
        {authLoading ? "退出中…" : "退出登录"}
      </button>
    </section>
  );
}

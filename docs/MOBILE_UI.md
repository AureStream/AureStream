# 移动端 UI

本仓库 **前端已不再包含移动端专用界面**（已移除响应式分流、`MobileLayout`、移动端首页面板及配套液态玻璃 Dock 样式）。

移动端计划 **单独工程或独立入口** 实现，与当前 **PC 壳层（侧边栏 + `MainContent`）** 完全分离。

若需参考历史实现，可在 Git 历史中检索已删除路径：

- `src/components/layout/MobileLayout.tsx`
- `src/pages/MobileDashboard.tsx`
- `src/components/dashboard/HomeDashboardPanel.tsx`
- `src/hooks/useIsMobile.ts`

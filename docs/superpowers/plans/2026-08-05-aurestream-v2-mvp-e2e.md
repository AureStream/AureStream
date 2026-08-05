# AureStream v2 MVP — E2E 验收记录

Task 12（Windows `10.20.41.26` 手工验收）改为：由 CI 产出 Windows x64 安装包后本地安装测试。

## 验收清单

- [ ] 登录 / 注册+验证码可用
- [ ] 首页出现，无长时间白屏门闸
- [ ] `subs-updated` 后节点列表出现
- [ ] 连接后系统代理生效；百度 + Google 可用
- [ ] 停止后系统代理清除
- [ ] 未创建 TUN 适配器

## 构建

分支：`feat/aurestream-v2-mvp`  
工作流：`Build desktop bundles`（`workflow_dispatch` 默认仅 Windows x64）

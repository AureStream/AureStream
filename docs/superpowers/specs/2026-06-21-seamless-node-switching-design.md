# 基于 Clash API 的无缝节点切换设计

## 背景
当前 AureStream 在切换节点时，会调用后端的 `reload_config` 命令，对 `sing-box` 进程发送 `SIGHUP` 信号以重载配置。
然而在**虚拟网关（TUN）模式**下，`sing-box` 收到 `SIGHUP` 信号后会重新绑定/创建虚拟网卡接口（macOS 上为 `utun233`），导致由于接口冲突/繁忙报错，进而导致 `sing-box` 进程异常退出。外围的监控服务检测到退出后，将应用状态重置为“已断开”，影响了用户的使用体验。

为了解决此问题，本设计提出：无论在系统代理还是虚拟网关模式下，当引擎运行时，切换节点改用 `sing-box` 的 `Clash API` 进行动态切换，以实现无缝的秒级切换，避免任何连接中断。

## 方案设计

### 1. 新增 `switchNodeActive` 核心方法
在 [hot-reload-config.ts](file:///Users/wry/IdeaProjects/AureStream/src/lib/hot-reload-config.ts) 中引入新方法：
- **引擎未运行**：直接生成最新的 `config.json` 写入磁盘，确保下一次启动时应用新选中的节点。
- **引擎运行中**：
  1. 调用 Clash API 的 `PUT /proxies/ExitGateway` 接口（对应 [selectProxyNode](file:///Users/wry/IdeaProjects/AureStream/src/utils/singbox-api/proxies.ts#L20) 方法）进行节点切换。
  2. 若 API 成功，静默更新磁盘上的 `config.json`（调用 `mergeConnectionConfig`），但**不**向后台进程发送任何重载/重启的指令，保证正在运行的连接无缝转移。
  3. 若 API 失败（降级回退），则调用现有的 `hotReloadConnectionConfig`，通过 `SIGHUP` 或重启方式强制载入新配置。

### 2. 前端组件替换
在节点列表页面 [NodesPage.tsx](file:///Users/wry/IdeaProjects/AureStream/src/components/NodesPage.tsx#L230-L236) 中，将点击节点时触发的 `hotReloadIfRunning(activeSubId)` 替换为 `switchNodeActive(activeSubId, node.id)`。

## 关键技术决策

1. **接口兼容性**：
   - 项目中所有的自定义代理节点都会被推入 `ExitGateway` 代理组中，该组的类型是 `selector`。因此，调用 `PUT /proxies/ExitGateway` 是标准的 Clash 代理切换操作。
2. **API 状态保障与降级机制**：
   - 由于前端与 sing-box 进程间通过 HTTP 交互可能存在短暂超时或未就绪（如刚启动），如果 `selectProxyNode` 接口返回失败，必须有回退兜底，此时调用 `hotReloadConnectionConfig` 执行原有的 `SIGHUP` 信号重载。
3. **磁盘配置文件更新**：
   - 动态切换节点仅会更改 sing-box 内存中的路由选择，为了使下一次应用启动时依然保留用户的节点选择，必须在动态切换成功后执行后台静默写入 `config.json` 的操作。

## 验证计划

### 自动化验证
- 执行 `pnpm build` 以确保 TypeScript 编译和依赖分析通过。

### 手动验证
- **TUN 模式验证**：
  1. 开启虚幻网关（TUN）模式并成功连接。
  2. 在节点页面点击切换其它节点，观察右上角连接状态是否依然保持为“安全托管中”（即未发生断开）。
  3. 访问外部网络，确认节点已切实切换，且网络未发生中断。
- **降级验证**：
  1. 模拟 Clash API 端口临时不可用，点击切换节点，确认仍能回退成功切换（虽然可能会触发重置）。

### 静态配置模板 + proxy-providers（本地文件）

**核心思想**：应用在本地生成一份固定结构的运行时配置，不把用户订阅整份当作唯一配置执行。节点来自**订阅管理已下载的本地文件**（与 `download_subscription` 写入的 `subscriptions/<provider_id>.yaml` 同源）。

**proxy-providers（实现为 `AureStream_Sub`）**：订阅文件仍由应用保存在配置目录 **`subscriptions/<provider_id>.yaml`**（与 `download_subscription` 同源）。生成内核配置时会**复制到** **`mihomo-work/subscriptions/<provider_id>.yaml`**，并在 YAML 中写入该路径：Mihomo `type: file` 的 `path` 必须在 `-d`（工作目录）下。

```yaml
proxy-providers:
  AureStream_Sub:
    type: file
    path: "<绝对路径>/…/mihomo-work/subscriptions/<provider_id>.yaml"
    interval: 3600
    health-check:
      enable: true
      interval: 300
      url: http://www.gstatic.com/generate_204

proxy-groups:
  - name: AureStream_Node_Selector
    type: select
    use:
      - AureStream_Sub

rules:
  - GEOIP,private,DIRECT
  - GEOIP,CN,DIRECT
  - GEOSITE,cn,DIRECT
  - MATCH,AureStream_Node_Selector
```

Rust 命令 **`build_aurestream_mihomo_config(provider_id)`**：校验配置目录订阅存在 → 复制至 `mihomo-work/subscriptions/` → `canonicalize` 后写入生成的 **`runtime/aurestream-mihomo.yaml`**。

**前端**：

- **`buildAureStreamMihomoConfig(providerId)`**（无需再传订阅 URL）。
- 获取节点：连接后 `getGroupByName('AureStream_Node_Selector')`（或 `getGroups`）得到扁平可选项。
- 切换节点：`selectNodeForGroup('AureStream_Node_Selector', 节点名)`。

**优点**：规则与出口组由产品掌握；订阅内原有复杂 `rules`/`proxy-groups` 不直接生效；无需再让内核 HTTP 拉订阅链接，与「先下载到本地再连接」一致。

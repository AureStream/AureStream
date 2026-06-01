# 排版与颜色规范

AureStream 使用语义化 CSS 类与主题变量，避免在页面中散落 `text-[9px]`、`slate-550` 等任意值。

## 主题变量

定义于 `src/index.css` 的 `:root` / `.dark`：

| 变量 | 用途 |
|------|------|
| `--foreground` | 主文字 |
| `--muted-foreground` | 次要说明 |
| `--primary` | 品牌色、强调、图表主色 |
| `--border` | 边框与分隔 |
| `--card` | 卡片与主内容区背景 |

## 排版等级

| 类名 | 场景 |
|------|------|
| `type-page-title` | 页面主标题（如「设置」） |
| `type-page-subtitle` | 页面副标题 |
| `type-section-title` | 卡片区块标题 |
| `type-label` | 表单项 / 设置项标题 |
| `type-value` / `type-value-lg` | 强调数值 |
| `type-description` | 正文说明 |
| `type-caption` | 辅助说明（约 11px） |
| `type-hint` | 更弱的提示 |
| `type-overline` | 全大写分组标签 |
| `type-kv-label` / `type-kv-value` | 键值对行（网络信息） |

常量导出见 `src/lib/typography.ts`。

## 表面与组件

| 类名 | 场景 |
|------|------|
| `surface-row` | 设置项一行容器 |
| `surface-chip` | 统计小卡片 |
| `ui-input` / `ui-textarea` | 表单控件 |
| `btn-accent` / `btn-pill` | 次要操作与分段选择 |
| `ui-badge-*` | 状态标签 |
| `icon-badge-*` | 区块标题图标底 |

## 使用约定

1. 新 UI 优先使用 `type-*` / `surface-*`，不要新增小于 11px 的字号。
2. 颜色使用 `text-foreground`、`text-muted-foreground`、`text-primary`、`text-destructive` 等语义类。
3. 深色模式通过 CSS 变量自动切换，避免手写 `dark:text-slate-*` 长链。

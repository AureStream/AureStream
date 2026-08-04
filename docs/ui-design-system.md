# UI 设计系统

AureStream 采用 **shadcn/ui new-york** 风格：语义化 CSS 变量 + 统一组件，暗色模式通过 `data-theme="dark"` 切换。

## 1. 设计理念
- **Standard shadcn**: 优先使用 `src/components/ui/*` 原语。
- **Token 驱动**: HSL 自定义属性（`--background`、`--primary`…）。
- **品牌色**: `primary` = `#6C5CFF`（紫）。
- **字体**: 全站 Inter。

## 2. 主题变量
定义于 `src/index.css` 的 `:root` 与 `[data-theme="dark"]`。
- 核心: `--background`, `--foreground`, `--card`, `--primary`, `--muted`, `--border`, `--destructive`, `--ring`。
- Tailwind: `bg-background`, `text-foreground`, `bg-primary`, `text-muted-foreground` 等。
- 过渡期保留旧别名: `bg-bg`, `text-text`, `text-danger` 等，迁移后删除。

## 3. 组件库 (`src/components/ui/`)
已落地: `button`, `card`, `input`, `label`, `separator`, `switch`。  
按需继续添加: `badge`, `scroll-area`, `progress`, `tabs`, `avatar`, `dialog`。

## 4. 文案
- UI 文案为中文硬编码，无 i18n。

## 5. 使用规范
- 新 UI **必须**用 shadcn 组件 + 语义 token，禁止散落硬编码色（`#6C5CFF` 仅允许作为 token 源）。
- **禁止小于 11px** 字号。
- 图标优先 `lucide-react`。
- 国旗使用 `CountryFlag` / `country-flags.ts`。


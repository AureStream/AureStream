# UI 设计系统

AureStream 采用现代极简主义设计风格，融合了 shadcn/ui 组件库与系统级的暗黑模式适配。

## 1. 设计理念
- **Modern Minimalist**: 聚焦核心功能，剔除不必要的装饰。
- **CSS 变量驱动**: 采用 HSL 格式的 CSS 自定义属性构建动态主题。
- **Dark Mode First**: 原生优先支持暗黑模式。

## 2. 主题变量
定义于 `src/index.css` 的 `:root` 与 `.dark` 选择器下。
- 核心变量: `--background`, `--foreground`, `--muted-foreground`, `--primary`, `--border`, `--card`, `--accent`, `--destructive`。
- 使用这些变量确保在不同主题间平滑过渡，不需要手动添加 `dark:` Tailwind 类。

## 3. 排版规范 (Typography)
标准化的一系列字体排版 Class，导出自 `src/lib/typography.ts`。
- **标题级**: `type-page-title`, `type-page-subtitle`, `type-section-title`
- **标签与文本**: `type-label`, `type-value`, `type-value-lg`, `type-description`
- **小字号**: `type-caption`, `type-hint`, `type-overline`
- **键值对**: `type-kv-label`, `type-kv-value`

## 4. 表面与基础组件类
- **Surface**: `surface-row`, `surface-chip`
- **输入**: `ui-input`, `ui-textarea`
- **按钮**: `btn-accent`, `btn-pill`, `btn-toolbar` / `btn-toolbar-active`（节点列表工具栏）
- **徽章**: `ui-badge-*`, `icon-badge-*`

## 5. shadcn/ui 组件库
引入了 10 个轻量级基础 UI 原语 (new-york 风格):
`badge`, `button`, `card`, `chart`, `progress`, `radio-group`, `scroll-area`, `separator`, `switch`, `tooltip`。

## 6. 国际化 (i18n)
- 基于 `i18next` 框架构建。
- 默认中文，同时提供完整的英文支持。
- 根据系统 Locale 自动回退匹配语言。

## 7. 使用规范
- 新的 UI 代码必须优先使用预定义的 `type-*` 和 `surface-*` 类。
- **禁止使用小于 11px 的字体大小**。
- 颜色绑定必须使用语义化类 (如 `text-muted-foreground`) 而非硬编码色值。
- 国旗使用 `CountryFlag` 组件（`country-flag-icons` 离线 SVG）；国家代码由 `country-flags.ts` 从节点名解析；未知地区显示白底地球占位图（`unknown-flag.tsx`）。
- 启动屏：`index.html` 内联双环动画；应用内加载使用 `LoadingScreen` + `CircularLoader`。
- 节点列表卡片采用容器查询（`@container`）控制双列布局与工具栏文案显隐；滚动区与卡片底边保持 `pb-4 sm:pb-5` 留白。

import i18n from "i18next"
import { initReactI18next } from "react-i18next"

import en from "../lang/en.json"
import zh from "../lang/zh.json"

// Extend existing translations with new UI keys
const enExtended = {
  ...en,
  // Auth
  login: "Login",
  register: "Register",
  email: "Email",
  password: "Password",
  confirm_password: "Confirm Password",
  username: "Username",
  remember_me: "Remember me",
  forgot_password: "Forgot password?",
  no_account: "Don't have an account?",
  has_account: "Already have an account?",
  sign_up: "Sign Up",
  sign_in: "Sign In",
  agree_terms: "I agree to the Terms of Service",
  welcome_back: "Welcome back,",
  login_subtitle: "Sign in to continue your secure connection",
  register_subtitle: "Create an account to get started",
  brand_tagline: "Secure. Fast. Unlimited.",
  brand_description: "Experience premium network acceleration with military-grade encryption and global server coverage.",

  // Dashboard
  welcome_greeting: "Welcome back, {{name}}!",
  dashboard_subtitle: "Manage your secure connections and monitor your network activity",
  current_plan: "Current Plan",
  data_usage: "Data Used",
  expires_on: "Expires On",
  days_left: "days left",
  connection_control: "Connection Control",
  tap_to_connect: "Tap to Connect",
  tap_to_disconnect: "Tap to Disconnect",
  select_server: "Select Server",
  connection_time: "Connection Time",
  recent_connections: "Recent Connections",
  server: "Server",
  duration: "Duration",
  date: "Date",
  status: "Status",
  speed: "Speed",
  profile: "Profile",
  quick_stats: "Quick Stats",
  sessions_today: "Sessions Today",
  total_data: "Total Data",
  avg_speed: "Avg Speed",
  online: "Online",
  offline: "Offline",

  // Subscription
  choose_plan: "Choose Your Plan",
  subscription_subtitle: "Select the plan that best fits your needs",
  monthly: "Monthly",
  yearly: "Yearly",
  save_percent: "Save {{percent}}%",
  basic_plan: "Basic",
  pro_plan: "Pro",
  ultimate_plan: "Ultimate",
  recommended: "Recommended",
  per_month: "/month",
  per_year: "/year",
  billed_yearly: "Billed yearly",
  get_started: "Get Started",
  current: "Current",
  upgrade: "Upgrade",
  features_basic_1: "1 Device Connection",
  features_basic_2: "Standard Speed",
  features_basic_3: "Basic Support",
  features_basic_4: "5 Server Locations",
  features_pro_1: "3 Device Connections",
  features_pro_2: "High-Speed Access",
  features_pro_3: "Priority Support",
  features_pro_4: "25 Server Locations",
  features_pro_5: "Ad Blocker",
  features_ultimate_1: "Unlimited Devices",
  features_ultimate_2: "Ultra-Fast Speed",
  features_ultimate_3: "24/7 Dedicated Support",
  features_ultimate_4: "All Server Locations",
  features_ultimate_5: "Dedicated IP",
  features_ultimate_6: "Advanced Security",

  // Sidebar
  nav_home: "Home",
  nav_connection: "Connection",
  nav_subscription: "Plans",
  nav_settings: "Settings",
  upgrade_prompt: "Upgrade Plan",
  upgrade_desc: "Get more speed and features",

  // Theme
  theme_light: "Light",
  theme_dark: "Dark",

  // Connection statuses
  status_connected: "Connected",
  status_disconnected: "Disconnected",
  status_connecting: "Connecting...",

  // Misc
  logout: "Logout",
  version: "Version",
  all_rights_reserved: "All rights reserved.",
}

const zhExtended = {
  ...zh,
  // Auth
  login: "登录",
  register: "注册",
  email: "邮箱",
  password: "密码",
  confirm_password: "确认密码",
  username: "用户名",
  remember_me: "记住我",
  forgot_password: "忘记密码？",
  no_account: "还没有账户？",
  has_account: "已有账户？",
  sign_up: "注册",
  sign_in: "登录",
  agree_terms: "我同意服务条款",
  welcome_back: "欢迎回来，",
  login_subtitle: "登录以继续您的安全连接",
  register_subtitle: "创建账户以开始使用",
  brand_tagline: "安全 · 快速 · 无限制",
  brand_description: "体验军事级加密和全球服务器覆盖的高级网络加速服务。",

  // Dashboard
  welcome_greeting: "欢迎回来，{{name}}！",
  dashboard_subtitle: "管理您的安全连接并监控网络活动",
  current_plan: "当前套餐",
  data_usage: "已用流量",
  expires_on: "到期时间",
  days_left: "天剩余",
  connection_control: "连接控制",
  tap_to_connect: "点击连接",
  tap_to_disconnect: "点击断开",
  select_server: "选择服务器",
  connection_time: "连接时长",
  recent_connections: "最近连接",
  server: "服务器",
  duration: "时长",
  date: "日期",
  status: "状态",
  speed: "速度",
  profile: "个人资料",
  quick_stats: "快速统计",
  sessions_today: "今日会话",
  total_data: "总流量",
  avg_speed: "平均速度",
  online: "在线",
  offline: "离线",

  // Subscription
  choose_plan: "选择您的套餐",
  subscription_subtitle: "选择最适合您需求的方案",
  monthly: "月付",
  yearly: "年付",
  save_percent: "省 {{percent}}%",
  basic_plan: "基础版",
  pro_plan: "专业版",
  ultimate_plan: "旗舰版",
  recommended: "推荐",
  per_month: "/月",
  per_year: "/年",
  billed_yearly: "按年计费",
  get_started: "开始使用",
  current: "当前",
  upgrade: "升级",
  features_basic_1: "1 台设备连接",
  features_basic_2: "标准速度",
  features_basic_3: "基础支持",
  features_basic_4: "5 个服务器位置",
  features_pro_1: "3 台设备连接",
  features_pro_2: "高速访问",
  features_pro_3: "优先支持",
  features_pro_4: "25 个服务器位置",
  features_pro_5: "广告拦截",
  features_ultimate_1: "无限设备",
  features_ultimate_2: "极速连接",
  features_ultimate_3: "7×24 专属客服",
  features_ultimate_4: "全部服务器位置",
  features_ultimate_5: "专属 IP",
  features_ultimate_6: "高级安全防护",

  // Sidebar
  nav_home: "首页",
  nav_connection: "连接",
  nav_subscription: "套餐",
  nav_settings: "设置",
  upgrade_prompt: "升级套餐",
  upgrade_desc: "获取更快的速度和更多功能",

  // Theme
  theme_light: "浅色",
  theme_dark: "深色",

  // Connection statuses
  status_connected: "已连接",
  status_disconnected: "未连接",
  status_connecting: "连接中...",

  // Misc
  logout: "退出登录",
  version: "版本",
  all_rights_reserved: "保留所有权利。",
}

i18n.use(initReactI18next).init({
  resources: {
    en: { translation: enExtended },
    zh: { translation: zhExtended },
  },
  lng: navigator.language.startsWith("zh") ? "zh" : "en",
  fallbackLng: "en",
  interpolation: {
    escapeValue: false,
  },
})

export default i18n

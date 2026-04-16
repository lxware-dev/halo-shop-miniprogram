# 项目配置

本文说明如何通过配置文件将小程序适配为你的品牌与接口地址，并与 Halo 后台对齐。

## 配置文件一览

| 文件                               | 作用                                                                              |
| ---------------------------------- | --------------------------------------------------------------------------------- |
| `src/config/app.config.json`       | **基础配置**，随仓库提交，作为团队默认值                                          |
| `src/config/app.config.local.json` | **本地/环境覆盖**，与基础配置深度合并；**请勿将含敏感信息的该文件提交到公开仓库** |
| `.env`（根目录）                   | Vite 环境变量，如 `VITE_MOCK_ENABLED`、`VITE_MOCK_DELAY`                          |
| `src/pages.json`                   | uni-app 页面路由、TabBar、分包、预加载等                                          |
| `src/manifest.json`                | 应用名称、版本号、各端 AppID 等                                                   |

**合并逻辑**：Vite 插件在构建时先读取 `app.config.json`，若存在 `app.config.local.json` 则对其做**深度合并**（对象递归合并；数组与叶子节点以覆盖文件优先）。实现见 `plugins/vite-plugin-app-config.ts`。

> [!IMPORTANT]
> 配置在**构建时**被打包进产物，修改配置后需重新执行 `pnpm dev:*` 或 `pnpm build:*` 才能生效。

## 最小可运行示例

在 `src/config/app.config.local.json` 中填写以下内容即可启动（请替换为你的实际域名与文案）：

```json
{
  "app": {
    "name": "你的商城名称",
    "nameFontSize": "48rpx",
    "logo": "/static/logo.png",
    "logoWidth": "160rpx",
    "version": "1.0.0"
  },
  "halo": {
    "baseURL": "https://your-halo.example.com"
  },
  "auth": {
    "loginMethods": {
      "primary": "haloAccount",
      "supported": ["haloAccount"]
    }
  },
  "business": {
    "legalDocuments": {
      "userAgreement": "https://your-domain.com/terms",
      "privacyPolicy": "https://your-domain.com/privacy"
    }
  }
}
```

## 配置项详解

### `app` — 应用基本信息

| 字段                 | 说明                                               |
| -------------------- | -------------------------------------------------- |
| `name`               | 应用名称，显示于登录页、关于我们等处               |
| `nameFontSize`       | 应用名称字号，建议填写 `rpx`，如 `48rpx`           |
| `logo`               | Logo 地址，可为本地路径（`/static/...`）或完整 URL |
| `logoWidth`          | Logo 显示宽度，建议填写 `rpx`，如 `160rpx`         |
| `version`            | 关于我们等处展示的版本号                           |
| `brandDescription`   | 品牌介绍文案                                       |
| `companyName`        | 公司名称，用于关于我们页面                         |
| `copyrightOwner`     | 版权所有者                                         |
| `copyrightStartYear` | 版权起始年份                                       |

> [!TIP]
> 当你的品牌 Logo 比较扁、比较高，或左右留白较多时，优先通过 `app.logoWidth` 调整显示宽度；如果应用名称过长或品牌字重较强，可通过 `app.nameFontSize` 微调标题大小，而不必改代码。

### `halo` — Halo 服务连接

| 字段      | 说明                                                                              |
| --------- | --------------------------------------------------------------------------------- |
| `baseURL` | Halo 服务根地址，**不要**带末尾多余路径；需与小程序 request 合法域名一致（HTTPS） |
| `timeout` | 请求超时时间（毫秒），默认 `10000`                                                |

### `i18n` — 国际化

| 字段            | 说明                                                         |
| --------------- | ------------------------------------------------------------ |
| `defaultLocale` | 默认语言，可选 `zh-CN` 或 `en-US`，与 `src/locales` 配合使用 |

### `auth` — 登录配置

#### `auth.loginMethods`

| 字段        | 说明                         |
| ----------- | ---------------------------- |
| `primary`   | 默认展示的登录方式           |
| `supported` | 用户可切换的其他登录方式列表 |

**支持的登录方式：**

| 值            | 说明                                                               |
| ------------- | ------------------------------------------------------------------ |
| `phoneQuick`  | 微信内**手机号一键登录**，仅在微信小程序环境下可用，需用户同意协议 |
| `haloAccount` | 账号密码登录，依赖 Halo 用户体系                                   |
| `phoneCode`   | 手机验证码登录（取决于后台与产品实现）                             |
| `email`       | 邮箱登录（取决于后台与产品实现）                                   |

> [!NOTE]
> `primary` 与 `supported` 必须与 Halo 后台实际开启的登录能力一致，否则会出现登录失败或入口异常。

### `dev` — 开发调试

#### `dev.basicAuth`

仅在**开发构建**下生效，配置 `username` 与 `password` 后可用于 Basic Auth 联调。

> [!WARNING]
> 不要在生产环境依赖此方式作为正式登录方案。

### `business` — 业务配置

| 字段                    | 说明                         |
| ----------------------- | ---------------------------- |
| `currencySymbol`        | 价格货币符号，默认 `¥`       |
| `maxCartItems`          | 单商品购物车数量上限         |
| `contactServiceEnabled` | 是否展示联系客服入口         |
| `legalDocuments`        | 协议与法务链接（见下方说明） |
| `helpCenterFaqs`        | 帮助中心 FAQ 问答列表        |

#### `business.legalDocuments`

| 字段               | 说明                 |
| ------------------ | -------------------- |
| `userAgreement`    | 用户协议链接         |
| `privacyPolicy`    | 隐私政策链接         |
| `paymentAgreement` | 支付说明链接（可选） |
| `platformRules`    | 平台规则链接（可选） |
| `qualification`    | 经营资质链接（可选） |

> [!TIP]
> 上线前，所有法务链接建议均为 **HTTPS** 可访问地址。若使用 `<web-view>` 组件打开，还需在微信公众平台配置对应**业务域名**。

## Mock 与环境变量

根目录 `.env` 文件示例：

```env
VITE_MOCK_ENABLED=false
VITE_MOCK_DELAY=400
```

| 变量                | 说明                                                         |
| ------------------- | ------------------------------------------------------------ |
| `VITE_MOCK_ENABLED` | 设为 `true` 时，请求走 Mock，不依赖真实 Halo，适合纯前端演示 |
| `VITE_MOCK_DELAY`   | Mock 响应延迟（毫秒），用于模拟网络延迟                      |

如需区分多个环境，可扩展为 `.env.development`、`.env.production`（需与 Vite 约定一致）。

## `pages.json` 与 `manifest.json`

- **`src/pages.json`**：新增/调整页面、TabBar、分包时修改。错误配置会导致页面无法打开或包体过大。
- **`src/manifest.json`**：小程序 **AppID**、应用名称、版本号等。发布前请与微信公众平台信息保持一致。

## 常见配置错误

| 现象                 | 可能原因                                                                             |
| -------------------- | ------------------------------------------------------------------------------------ |
| 请求失败 / 网络错误  | `baseURL` 错误、未配置合法域名、非 HTTPS、证书问题                                   |
| 登录无入口或行为异常 | `loginMethods` 与后台能力不一致；`phoneQuick` 未在微信环境测试                       |
| 协议页打不开         | `legalDocuments` 链接错误，或域名未加入业务域名，或非 HTTPS                          |
| 修改配置不生效       | 需重新执行 `pnpm dev:*` / `pnpm build:*`；确认改的是已合并的 `app.config.local.json` |

更多排错见 [faq.md](./faq.md)。

## 相关文档

- [prepare-local.md](./prepare-local.md) — 本地环境搭建
- [deployment.md](./deployment.md) — 构建命令与产物目录
- [payments.md](./payments.md) — 登录与支付配置详解
- [faq.md](./faq.md) — 常见问题排查

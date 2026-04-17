# 项目配置

本文说明如何通过配置文件将小程序适配为你的品牌与接口地址，并与 Halo 后台对齐。

## 配置文件一览

| 文件                               | 作用                                                                                                           |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------- |
| `src/config/app.config.json`       | **基础配置**，随仓库提交，作为团队默认值，通常不建议直接修改此文件。**请勿将含敏感信息的该文件提交到公开仓库** |
| `src/config/app.config.local.json` | **本地/环境覆盖**，与基础配置深度合并；                                                                        |
| `.env`（根目录）                   | Vite 环境变量，如 `VITE_MOCK_ENABLED`、`VITE_MOCK_DELAY`                                                       |
| `src/pages.json`                   | uni-app 页面路由、TabBar、分包、预加载等                                                                       |
| `src/manifest.json`                | 应用名称、版本号、各端 AppID 等                                                                                |

> [!IMPORTANT]
> 配置在**构建时**被打包进产物，修改配置后需重新执行 `pnpm dev:*` 或 `pnpm build:*` 才能生效。

## `app.config.local.json` — 基础配置

该配置文件为小程序基础配置，其配置会直接体现在小程序内部，包含接口信息、商城基础信息、登录方式配置、业务信息配置、国际化配置等。

`app.config.local.json` 中的设置，将覆盖 `app.config.json` 中的默认配置，因此请务必覆盖想修改的配置，如果不填写，则会使用默认配置。

### 最小可运行示例

在 `src/config/app.config.local.json` 中填写以下内容即可启动（请替换为你的实际域名与文案）：

```json
{
  "app": {
    "name": "你的商城名称",
    "logo": "/static/logo.png"
  },
  "halo": {
    "baseURL": "https://your-halo.example.com"
  },
  "auth": {
    "loginMethods": {
      "primary": "phoneQuick",
      "supported": ["haloAccount"]
    }
  }
}
```

### 配置项详解

#### `app` — 应用基本信息

| 字段                 | 说明                                                                       |
| -------------------- | -------------------------------------------------------------------------- |
| `name`               | 商城名称，展示于`登录页`、`关于我们`等处                                   |
| `nameFontSize`       | 商城名称字号，建议填写 `rpx`，如 `48rpx`， 1px ≈ 2rpx                      |
| `logo`               | Logo 地址，可为本地路径（`/static/...`）或完整 URL，通常展示在商城名称上方 |
| `logoWidth`          | Logo 显示宽度，建议填写 `rpx`，如 `160rpx`                                 |
| `brandDescription`   | 品牌介绍文案，展示于`关于我们`处                                           |
| `companyName`        | 公司名称，展示于`关于我们`底部单独展示的一行公司名称。                     |
| `copyrightOwner`     | 版权所有者                                                                 |
| `copyrightStartYear` | 版权起始年份                                                               |

> [!TIP]
> 当你的品牌 Logo 比较扁、比较高，或左右留白较多时，优先通过 `app.logoWidth` 调整显示宽度；如果应用名称过长或品牌字重较强，可通过 `app.nameFontSize` 微调标题大小，而不必改代码。

#### `halo` — Halo 服务连接

| 字段      | 说明                                                                    |
| --------- | ----------------------------------------------------------------------- |
| `baseURL` | Halo 服务根地址，在生产环境中，需与小程序 request 合法域名一致（HTTPS） |
| `timeout` | 请求超时时间（毫秒），默认 `10000`                                      |

#### `i18n` — 国际化

| 字段            | 说明                              |
| --------------- | --------------------------------- |
| `defaultLocale` | 默认语言，可选 `zh-CN` 或 `en-US` |

#### `auth` — 登录配置

##### `auth.loginMethods`

| 字段        | 说明                         |
| ----------- | ---------------------------- |
| `primary`   | 默认展示的登录方式           |
| `supported` | 用户可切换的其他登录方式列表 |

**当前支持的登录方式：**

| 值            | 说明                                         |
| ------------- | -------------------------------------------- |
| `phoneQuick`  | **手机号一键登录**，此功能拥有自动注册功能。 |
| `haloAccount` | Halo 账号密码登录                            |

> [!NOTE]
> 开启 `phoneQuick` 即手机号一键登录后，同时也会启用新用户手机号自动注册的功能，因此请务必在 Halo 后台中，启用开放注册功能，详见 [prepare-backend.md](./prepare-backend.md)。

#### `business` — 业务配置

| 字段                    | 说明                                                                                                     |
| ----------------------- | -------------------------------------------------------------------------------------------------------- |
| `currencySymbol`        | 价格货币符号，默认 `¥`                                                                                   |
| `maxCartItems`          | 单商品购物车数量上限                                                                                     |
| `contactServiceEnabled` | 是否展示联系客服入口，开启此功能后，需要前往小程序客服中，设置客服人员。（此功能暂时只有微信小程序支持） |
| `legalDocuments`        | 协议与法务链接（见下方说明）                                                                             |
| `helpCenterFaqs`        | 帮助中心 FAQ 问答列表                                                                                    |

##### `contactServiceEnabled`

用于控制页面中是否展示“联系客服”入口。当开启此功能后，需要前往 `微信小程序后台 - 基础功能 - 客服 - 小程序客服` 中，设置对应的客服人员。
![image-20260417181218786](/Users/lixingyong/Library/Application Support/typora-user-images/config-contact.png)

#### `business.legalDocuments`

| 字段               | 说明                  |
| ------------------ | --------------------- |
| `userAgreement`    | 用户协议链接（可选）Ï |
| `privacyPolicy`    | 隐私政策链接（可选）  |
| `paymentAgreement` | 支付说明链接（可选）  |
| `platformRules`    | 平台规则链接（可选）  |
| `qualification`    | 经营资质链接（可选）  |

> [!TIP]
> 上线前，所有法务链接建议均为 **HTTPS** 可访问地址，此地址还需在微信公众平台配置对应**业务域名**。

#### `business.helpCenterFaqs`

用于配置帮助中心中的常见问题与答案内容，适合补充配送、售后、支付说明等固定文案。

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
- [prepare-backend.md](./prepare-backend.md) — Halo 后台数据准备
- [prepare-go-live.md](./prepare-go-live.md) — 上线前域名、支付与真机验收
- [deployment.md](./deployment.md) — 构建命令与产物目录
- [faq.md](./faq.md) — 常见问题排查

# 本地准备

本文说明如何在本地将项目运行起来，以便于完成小程序侧的各类设置与接口配置，并与 Halo 后台完成联调，保证小程序的基本使用。

## 前提条件

在开始之前，请确认已具备以下环境：

| 工具            | 要求       | 说明                                                                                |
| --------------- | ---------- | ----------------------------------------------------------------------------------- |
| Node.js         | LTS 版本   | [下载地址](https://nodejs.org/)                                                     |
| pnpm            | 最新稳定版 | [安装说明](https://pnpm.io/installation)                                            |
| 微信开发者工具  | 最新版     | [下载地址](https://developers.weixin.qq.com/miniprogram/dev/devtools/download.html) |
| Halo 商业版服务 | >= 2.24.0  | 提供商品、订单、支付等商业能力                                                      |

> [!NOTE]
> 本仓库是 **Halo 商业版配套的小程序前端**，需连接可用的 Halo 服务端，不能单独作为完整商城后端使用。

## 第一步：获取代码

1. 点击 https://github.com/lxware-dev/halo-shop-miniprogram/fork 将本仓库 **Fork** 到你或团队的命名空间。
2. 克隆**你的 Fork**（而不是直接依赖上游），便于自定义分支与权限管理。

```bash
git clone <你的 Fork 仓库地址>
cd halo-shop-miniprogram
pnpm install
```

## 第二步：小程序本地化配置

### 应用配置

执行以下命令，复制一份默认配置作为本地覆盖文件：

```bash
cp src/config/app.config.json src/config/app.config.local.json
```

> [!WARNING]
> 请勿直接修改 `app.config.json`，否则可能将敏感信息提交到公开仓库。**始终在 `app.config.local.json` 中写入本地覆盖值。**

打开 `src/config/app.config.local.json`，按需填写以下常用字段：

| 字段                          | 说明                                       |
| ----------------------------- | ------------------------------------------ |
| `app.name`                    | 商城名称，显示于登录页、关于我们等处       |
| `app.nameFontSize`            | 商城名称字号，建议填写 `rpx`               |
| `app.logo`                    | Logo 路径，可为本地路径或完整 URL          |
| `app.logoWidth`               | Logo 显示宽度，建议填写 `rpx`              |
| `halo.baseURL`                | Halo 服务根地址，**必填**                  |
| `auth.loginMethods.primary`   | 主要登录方式，需与 Halo 后台开启的能力一致 |
| `auth.loginMethods.supported` | 可切换的登录方式列表                       |

最小可运行示例：

```json
{
  "app": {
    "name": "你的商城名称",
    "nameFontSize": "48rpx",
    "logo": "/static/logo.png",
    "logoWidth": "160rpx"
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

> [!TIP]
> 以上仅列出快速启动所需的核心字段。完整配置项（品牌信息、货币符号、客服入口、FAQ 等）请参阅 [config.md](./config.md)。

如果你更换了品牌 Logo，发现显示偏大、偏小，或应用标题视觉不协调，通常只需要调整 `app.logoWidth` 和 `app.nameFontSize`，无需修改页面代码。

### manifest.json

`src/manifest.json` 包含小程序的基础信息与各端平台配置，本地开发时通常只需关注以下字段：

| 字段          | 说明                                                         |
| ------------- | ------------------------------------------------------------ |
| `name`        | 应用名称                                                     |
| `description` | 应用描述                                                     |
| `versionName` | 版本名称（如 `1.0.0`），展示用                               |
| `versionCode` | 版本号（纯数字，如 `100`），用于版本比对                     |
| `appid`       | 微信小程序 AppID，真机预览与发布时**必须**与公众平台保持一致 |

最小示例（仅列出需要修改的字段）：

```json
{
  "name": "你的商城名称",
  "appid": "你的小程序 appid",
  "description": "你的商城描述",
  "versionName": "1.0.0",
  "versionCode": "100"
}
```

> [!TIP]
> 以上为本地开发阶段最常用的字段且需要关注的字段。当前小程序所需权限已默认配置。其他完整配置项（分包、权限、隐私信息等）请参阅 [uni-app manifest.json 官方文档](https://uniapp.dcloud.net.cn/collocation/manifest.html)。

### 环境变量（可选）

当进行本地二次开发且不想经过后台服务时，可以启用 `Mock` 模式。

在项目根目录的 `.env` 文件中配置构建相关变量：

```env
# 开启后请求走 Mock，不依赖真实 Halo 后端（适合纯前端演示）
VITE_MOCK_ENABLED=true
VITE_MOCK_DELAY=400
```

> [!TIP]
> 联调真实接口时，请务必确保 `VITE_MOCK_ENABLED=false`。

## 第三步：启动开发模式

```bash
pnpm dev:mp-weixin
```

启动后，打开**微信开发者工具**，选择**导入项目**，目录选择 `dist/dev/mp-weixin`。

> [!NOTE]
> 开发调试时，可在微信开发者工具中临时勾选「不校验合法域名、web-view（业务域名）、TLS 版本以及 HTTPS 证书」，以便在未配置合法域名的情况下进行本地联调。**真机预览与正式发布前必须完成合法域名配置**，详见 [prepare-go-live.md](./prepare-go-live.md)。

## 下一步

配置 Halo 商业版后台。小程序启动后，还需要在 Halo 后台完成小程序 Banner、快捷入口、小程序支付方式等数据录入，各核心流程才能正常跑通。

详见 [prepare-backend.md](./prepare-backend.md)。

## 相关文档

- [prepare.md](./prepare.md) — 文档总览与阅读指引
- [prepare-backend.md](./prepare-backend.md) — Halo 后台数据准备
- [config.md](./config.md) — 完整配置字段说明
- [deployment.md](./deployment.md) — 构建命令与产物目录
- [prepare-go-live.md](./prepare-go-live.md) — 上线前域名与公众平台配置
- [faq.md](./faq.md) — 常见问题排查

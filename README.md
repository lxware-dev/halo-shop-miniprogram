# halo-shop-miniprogram

基于 [Halo](https://www.halo.run) 的电商小程序，使用 Vue 3 + uni-app 构建，支持微信小程序及 H5 等多端。

## 技术栈

- **框架**：Vue 3 + uni-app（组合式 API）
- **状态管理**：Pinia + pinia-plugin-persistedstate
- **样式**：UnoCSS + SCSS
- **HTTP 请求**：Alova + @alova/adapter-uniapp
- **UI 组件**：TDesign uni-app
- **包管理器**：pnpm

## 快速开始

### 安装依赖

```bash
pnpm install
```

### 启动开发服务器

```bash
# 微信小程序
pnpm dev:mp-weixin
```

编译产物输出至 `dist/` 目录，微信小程序需在微信开发者工具中导入 `dist/dev/mp-weixin`。

## 开发环境配置

项目使用 `src/config/app.config.json` 作为基础配置文件，支持通过本地覆盖文件进行个性化配置，**无需修改受版本控制的基础配置**。

### 本地配置覆盖

在项目根目录创建 `src/config/app.config.local.json`（已被 `.gitignore` 忽略），该文件会在构建时与基础配置深度合并，同名字段以本地配置为准。

**示例：**

```json
{
  "halo": {
    "baseURL": "http://localhost:8090"
  },
  "auth": {
    "loginMethods": {
      "primary": "phoneQuick",
      "supported": ["phoneQuick", "phoneCode", "email", "haloAccount", "haloPat"]
    }
  },
  "dev": {
    "basicAuth": {
      "username": "admin",
      "password": "admin"
    }
  }
}
```

### 配置项说明

#### `app` — 应用基础信息

| 字段               | 类型     | 说明                     |
| ------------------ | -------- | ------------------------ |
| `name`             | `string` | 应用名称                 |
| `logo`             | `string` | Logo 图片路径            |
| `version`          | `string` | 关于我们展示的版本号     |
| `brandDescription` | `string` | 关于我们中的品牌简介文案 |

#### `halo` — Halo 服务连接

| 字段      | 类型     | 默认值                  | 说明                 |
| --------- | -------- | ----------------------- | -------------------- |
| `baseURL` | `string` | `http://localhost:8090` | Halo 服务地址        |
| `timeout` | `number` | `10000`                 | 请求超时时间（毫秒） |

#### `auth` — 认证配置

| 字段                     | 类型            | 说明                                       |
| ------------------------ | --------------- | ------------------------------------------ |
| `loginMethods.primary`   | `LoginMethod`   | 主要登录方式（大按钮展示）                 |
| `loginMethods.supported` | `LoginMethod[]` | 支持的登录方式列表，`primary` 必须包含在内 |

支持的登录方式（`LoginMethod`）：

| 值            | 说明                                                      |
| ------------- | --------------------------------------------------------- |
| `phoneQuick`  | 手机号一键登录（微信快速获取手机号，仅 `MP-WEIXIN` 可用） |
| `phoneCode`   | 手机号 + 短信验证码                                       |
| `email`       | 邮箱 + 验证码                                             |
| `haloAccount` | Halo 账号密码                                             |
| `haloPat`     | Halo Personal Access Token                                |

#### `dev` — 开发调试配置

| 字段                 | 类型     | 说明                        |
| -------------------- | -------- | --------------------------- |
| `basicAuth.username` | `string` | **调试用** BasicAuth 用户名 |
| `basicAuth.password` | `string` | **调试用** BasicAuth 密码   |

#### `business` — 业务参数

| 字段                    | 类型                                     | 默认值 | 说明                 |
| ----------------------- | ---------------------------------------- | ------ | -------------------- |
| `currencySymbol`        | `string`                                 | `¥`    | 货币符号             |
| `maxCartItems`          | `number`                                 | `99`   | 购物车单品最大数量   |
| `contactServiceEnabled` | `boolean`                                | `true` | 是否展示联系客服入口 |
| `legalDocuments`        | `Record<LegalDocumentKey, string>`       | -      | 协议与资质等外链配置 |
| `helpCenterFaqs`        | `{ question: string; answer: string }[]` | -      | 帮助中心 FAQ 列表    |

### 开发调试快速认证

开发阶段可在 `app.config.local.json` 中填写 `basicAuth`，跳过登录流程：

```json
{
  "halo": {
    "baseURL": "http://localhost:8090"
  },
  "dev": {
    "basicAuth": {
      "username": "admin",
      "password": "admin"
    }
  }
}
```

## 环境变量

环境变量通过 `.env` 文件配置，所有变量须以 `VITE_` 开头。

| 变量                | 类型      | 默认值  | 说明                                          |
| ------------------- | --------- | ------- | --------------------------------------------- |
| `VITE_MOCK_ENABLED` | `boolean` | `false` | 是否启用 Mock 数据，`true` 时请求不发往服务端 |
| `VITE_MOCK_DELAY`   | `number`  | `400`   | Mock 响应延迟时间（毫秒）                     |

本地可创建 `.env.development` 覆盖默认值（已被 `.gitignore` 忽略）：

```
VITE_MOCK_ENABLED=true
VITE_MOCK_DELAY=200
```

## 代码规范

```bash
# ESLint 检查
pnpm lint

# 自动修复
pnpm lint:fix

# Stylelint 检查
pnpm stylelint

# 类型检查
pnpm type-check
```

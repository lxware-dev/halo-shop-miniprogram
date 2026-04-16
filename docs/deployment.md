# 部署与构建

本文说明如何在本地运行项目、生成构建产物，以及发布前的检查要点。

## 环境搭建

在开始之前，确保已安装以下工具：

```bash
# 安装依赖
pnpm install
```

## 本地开发

### 微信小程序

```bash
pnpm dev:mp-weixin
```

启动后，打开**微信开发者工具**，选择**导入项目**，目录选择 `dist/dev/mp-weixin`。

> [!NOTE]
> 首次调试时，可在开发者工具中开启「不校验合法域名」，以便在本地测试未备案域名的接口。**真机预览与正式提审必须配置合法域名**，详见 [prepare-go-live.md](./prepare-go-live.md)。

### H5

```bash
pnpm dev:h5
```

按终端提示，在浏览器中访问本地地址即可预览。

## 生产构建

```bash
# 微信小程序
pnpm build:mp-weixin

# H5
pnpm build:h5
```

> [!IMPORTANT]
> 构建前，请确认 `halo.baseURL`、登录与业务配置已指向**目标环境**。配置在构建时被打包进产物，换环境需重新构建。

## 构建产物路径

| 模式 | 平台       | 产物目录               | 用途                         |
| ---- | ---------- | ---------------------- | ---------------------------- |
| 开发 | 微信小程序 | `dist/dev/mp-weixin`   | 日常调试，导入微信开发者工具 |
| 生产 | 微信小程序 | `dist/build/mp-weixin` | 上传体验版或正式版           |
| 开发 | H5         | `dist/dev/h5`          | 本地 H5 调试                 |
| 生产 | H5         | `dist/build/h5`        | H5 生产部署                  |

> [!NOTE]
> 实际产物路径以构建日志输出为准，若有差异请以终端日志为准。

## 微信开发者工具导入步骤

1. 打开微信开发者工具，点击**导入项目**。
2. 目录选择上述 `mp-weixin` 对应文件夹。
3. AppID 填写你在微信公众平台注册的小程序 AppID（与 `src/manifest.json` 中 `mp-weixin.appid` 保持一致）。
4. 点击**上传**，再前往微信公众平台选择版本提交审核（详见 [release.md](./release.md)）。

## 多环境配置

配置通过 Vite 在构建时打包进产物，不同环境需分别构建。

| 环境     | 建议方案                                                                                         |
| -------- | ------------------------------------------------------------------------------------------------ |
| 本地开发 | `app.config.local.json` 指向本机或内网穿透地址，可配合 Mock 数据                                 |
| 测试环境 | 独立 `baseURL`，独立小程序体验版；域名加入测试号白名单                                           |
| 生产环境 | 使用正式 Halo 域名；含密钥的配置不提交仓库；可通过 CI 注入或私密变量生成 `app.config.local.json` |

## 构建完成后的下一步

生成体验版或正式版之前，先确认当前 `halo.baseURL` 已切到线上 HTTPS 地址，并且微信公众平台已经配置好对应的 `request` 合法域名；如果页面里有外链图片，也要一并配置好 `downloadFile` 合法域名。同时，`auth.loginMethods` 需要与 Halo 后台实际开启的登录能力保持一致。

接着检查 `src/manifest.json` 中的版本号与 AppID 是否正确，确认主包和分包体积没有超出微信限制，再执行 `pnpm lint` 和 `pnpm type-check` 处理阻塞性问题。

最后在真机上把登录、支付、协议链接等关键路径走一遍。做完这些后，就可以继续参考 [prepare-go-live.md](./prepare-go-live.md) 完成域名与公众平台配置，或直接按 [release.md](./release.md) 的流程上传版本。

## 相关文档

- [prepare-go-live.md](./prepare-go-live.md) — 上线前域名与合规配置
- [config.md](./config.md) — 配置文件详解
- [release.md](./release.md) — 提审与发布流程
- [faq.md](./faq.md) — 常见问题排查

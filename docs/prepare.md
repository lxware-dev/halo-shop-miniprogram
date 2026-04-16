# 写在前面

在开始使用本项目之前，建议先阅读本文，了解项目定位、使用前提与文档结构，避免在错误的方向上花费时间。

## 项目定位

本仓库是 **Halo 商业版配套的微信小程序前端**，不包含独立后端，需连接已部署并可正常访问的 Halo 服务。

## 使用前提

- 本项目依赖 Halo 侧的**商品、订单、支付、用户**等商业能力，需使用 **Halo 商业版**才能完整对接上线。
- 确保当前小程序商户符合[交易类小程序运营规范](https://developers.weixin.qq.com/miniprogram/product/jiaoyilei/yunyingguifan.html)。
- 对于实物类小程序，还需要接入[订单发货管理](https://developers.weixin.qq.com/miniprogram/product/jiaoyilei/fahuoguanligongneng.html)。

## 文档结构

本文档集分为以下几个主题，建议按顺序阅读：

| 阶段     | 文档                                       | 说明                                      |
| -------- | ------------------------------------------ | ----------------------------------------- |
| 本地准备 | [prepare-local.md](./prepare-local.md)     | Fork、依赖安装、小程序本地化配置          |
| 后台数据 | [prepare-backend.md](./prepare-backend.md) | Halo 后台商品、首页、登录、支付等数据录入 |
| 配置参考 | [config.md](./config.md)                   | 配置文件详解、字段说明、最小示例          |
| 构建部署 | [deployment.md](./deployment.md)           | 本地调试、生产构建、多环境管理            |
| 业务接入 | [payments.md](./payments.md)               | 登录、微信支付、法务链接等                |
| 上线准备 | [prepare-go-live.md](./prepare-go-live.md) | 生产域名、微信公众平台、合规清单          |
| 发布上线 | [release.md](./release.md)                 | 上传版本、提交审核、正式发布              |
| 常见问题 | [faq.md](./faq.md)                         | 问题排查与常见错误                        |

## 准备阶段

- **本地准备**（[prepare-local.md](./prepare-local.md)）：在本地机器上将项目跑起来，完成小程序侧的品牌化与接口配置。

- **后台数据**（[prepare-backend.md](./prepare-backend.md)）：在 Halo 管理端完成商品、分类、首页、登录、支付等数据录入，确保各核心流程可以与前端联调跑通。

- **上线准备**（[prepare-go-live.md](./prepare-go-live.md)）：侧重首次上传体验版、提交审核或正式发布前，在**生产环境**与**微信公众平台**侧备齐所有条件，避免因域名、HTTPS、合规等问题导致真机或审核阶段失败。

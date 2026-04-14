/**
 * 登录方式配置项。
 *
 * - `phoneQuick`：手机号一键登录，仅微信小程序可用
 * - `phoneCode`：手机号 + 短信验证码登录
 * - `email`：邮箱 + 验证码登录
 * - `haloAccount`：账号密码登录
 */
export type LoginMethod = 'phoneQuick' | 'phoneCode' | 'email' | 'haloAccount';

/**
 * 每个 key 对应一个外部链接，页面会通过内置 WebView 打开。
 */
export type LegalDocumentKey =
  | 'userAgreement'
  | 'privacyPolicy'
  | 'paymentAgreement'
  | 'platformRules'
  | 'qualification';

/**
 * 帮助中心中的单条 FAQ 配置。
 */
export interface HelpCenterFaqItem {
  /**
   * 问题标题。
   */
  question: string;
  /**
   * 问题答案内容。
   */
  answer: string;
}

/**
 * 应用配置结构。
 * 对应 `src/config/app.config.json` 及其本地覆盖配置。
 */
export interface AppConfig {
  /**
   * 应用基础信息。
   */
  app: {
    /**
     * 应用名称，用于登录页、关于我们等页面展示。
     */
    name: string;
    /**
     * 应用 Logo 路径。
     */
    logo: string;
    /**
     * 关于我们中展示的版本号。
     */
    version: string;
    /**
     * 关于我们中的品牌介绍文案。
     */
    brandDescription: string;
  };
  /**
   * Halo 服务端连接配置。
   */
  halo: {
    /**
     * Halo 服务基地址。
     */
    baseURL: string;
    /**
     * 请求超时时间，单位毫秒。
     */
    timeout: number;
  };
  /**
   * 登录与认证相关配置。
   */
  auth: {
    /**
     * 登录方式配置。
     * `primary` 为主登录方式，`supported` 为可切换的登录方式列表，
     * 且 `supported` 中必须包含 `primary`。
     */
    loginMethods: {
      /**
       * 默认展示的主登录方式。
       */
      primary: LoginMethod;
      /**
       * 当前应用支持的登录方式列表。
       */
      supported: LoginMethod[];
    };
  };
  /**
   * 开发调试配置。
   */
  dev: {
    /**
     * 本地开发时可选的 Basic Auth 配置。
     * 不填写时表示不开启该调试能力。
     */
    basicAuth?: {
      /**
       * Basic Auth 用户名。
       */
      username: string;
      /**
       * Basic Auth 密码。
       */
      password: string;
    };
  };
  /**
   * 业务侧展示与行为配置。
   */
  business: {
    /**
     * 价格展示使用的货币符号。
     */
    currencySymbol: string;
    /**
     * 购物车中单个商品允许添加的最大数量。
     */
    maxCartItems: number;
    /**
     * 是否展示联系客服入口。
     */
    contactServiceEnabled: boolean;
    /**
     * 协议、规则、资质等法务文档链接。
     * 留空时，对应入口会被视为未配置。
     */
    legalDocuments: Record<LegalDocumentKey, string>;
    /**
     * 帮助中心页面展示的 FAQ 列表。
     */
    helpCenterFaqs: HelpCenterFaqItem[];
  };
}

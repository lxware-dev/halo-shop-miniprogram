const platformMap = {
  'mp-weixin': 'weixin',
  'mp-alipay': 'alipay',
  'mp-baidu': 'baidu',
  'mp-jd': 'jd',
  'mp-kuaishou': 'kuaishou',
  'mp-lark': 'lark',
  'mp-qq': 'qq',
  'mp-toutiao': 'toutiao',
  'mp-harmony': 'harmony',
};

export const getPlatform = () => {
  const { uniPlatform } = uni.getSystemInfoSync();
  return platformMap[uniPlatform as keyof typeof platformMap] || uniPlatform;
};

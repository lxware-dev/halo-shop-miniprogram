const MOBILE_PHONE_REG = /(?:\+?86[-\s]?)?(1[3-9]\d{9})(?!\d)/;
const LANDLINE_PHONE_REG = /(0\d{2,3}[-\s]?\d{7,8})(?!\d)/;
const SEPARATOR_REG = /[\n\r\t,，、;；|]+/g;
const EXTRA_SPACE_REG = /\s+/g;
const NBSP_REG = /\u00A0/g;
const BRACKET_REG = /[【】[\]()（）]/g;
const COLON_REG = /[:：]/g;
const COMMA_REG = /[，、,]/g;
const DIGIT_REG = /\d/;
const ADDRESS_FIELD_LABEL_REG =
  /(?:收货地址|详细地址|所在地区|地址信息|收件地址|联系人|收货人|收件人|姓名|电话|联系电话|手机号码|手机号|手机|地区)[:：]*/g;
const ADDRESS_NOISE_REG =
  /(?:默认地址|中国|联系电话同收货人|收件信息|收货信息|地址详情|具体地址|门牌号)[:：]*/g;
const ADDRESS_DETAIL_KEYWORD_REG = /[省市区县旗镇乡路街巷弄号栋幢座楼层室]|单元/;
const CHINESE_NAME_REG = /^[\u4E00-\u9FA5·]{2,6}$/;
const LATIN_NAME_REG = /^[a-z][a-z\s.'-]{1,29}$/i;
const MUNICIPALITIES = ['北京市', '天津市', '上海市', '重庆市'] as const;
const SPECIAL_PROVINCES = [...MUNICIPALITIES, '香港特别行政区', '澳门特别行政区'] as const;
const PROVINCE_REG =
  /(北京市|天津市|上海市|重庆市|香港特别行政区|澳门特别行政区|广西壮族自治区|内蒙古自治区|宁夏回族自治区|新疆维吾尔自治区|西藏自治区|\S+?省|\S+?自治区)/;
const CITY_REG = /^(?:\s|-)*([^\s-]+(?:市|地区|自治州|盟))/;
const DISTRICT_REG = /^(?:\s|-)*([^\s-]+(?:[区县市旗]|林区|特区|新区))/;
const COMPOUND_SURNAMES = [
  '欧阳',
  '太史',
  '端木',
  '上官',
  '司马',
  '东方',
  '独孤',
  '南宫',
  '万俟',
  '闻人',
  '夏侯',
  '诸葛',
  '尉迟',
  '公羊',
  '赫连',
  '澹台',
  '皇甫',
  '宗政',
  '濮阳',
  '公冶',
  '太叔',
  '申屠',
  '公孙',
  '慕容',
  '仲孙',
  '钟离',
  '长孙',
  '宇文',
  '司徒',
  '鲜于',
  '司空',
  '闾丘',
  '子车',
  '亓官',
  '司寇',
  '巫马',
  '公西',
  '颛孙',
  '壤驷',
  '公良',
  '漆雕',
  '乐正',
  '宰父',
  '谷梁',
  '拓跋',
  '夹谷',
  '轩辕',
  '令狐',
  '段干',
  '百里',
  '呼延',
  '东郭',
  '南门',
  '羊舌',
  '微生',
  '梁丘',
  '左丘',
  '东门',
  '西门',
  '南荣',
  '第五',
] as const;

export interface ReceiverNameParts {
  receiverName: string;
  lastName: string;
  firstName: string;
}

export interface SmartAddressParseResult extends ReceiverNameParts {
  contactPhone: string;
  province: string;
  city: string;
  district: string;
  streetAddress: string;
}

interface ExtractedValue {
  raw: string;
  value: string;
}

function normalizeAddressText(text: string) {
  return text
    .replace(NBSP_REG, ' ')
    .replace(BRACKET_REG, ' ')
    .replace(SEPARATOR_REG, ' ')
    .replace(ADDRESS_FIELD_LABEL_REG, ' ')
    .replace(ADDRESS_NOISE_REG, ' ')
    .replace(EXTRA_SPACE_REG, ' ')
    .trim();
}

function cleanupToken(token: string) {
  return token
    .replace(ADDRESS_FIELD_LABEL_REG, '')
    .replace(ADDRESS_NOISE_REG, '')
    .replace(COLON_REG, '')
    .replace(EXTRA_SPACE_REG, ' ')
    .trim();
}

function normalizeStreetAddress(text: string) {
  return text
    .replace(ADDRESS_FIELD_LABEL_REG, ' ')
    .replace(ADDRESS_NOISE_REG, ' ')
    .replace(COMMA_REG, ' ')
    .replace(EXTRA_SPACE_REG, ' ')
    .trim();
}

function extractPhone(text: string): ExtractedValue | null {
  const mobileMatch = text.match(MOBILE_PHONE_REG);
  if (mobileMatch) {
    return {
      raw: mobileMatch[0],
      value: mobileMatch[1],
    };
  }

  const landlineMatch = text.match(LANDLINE_PHONE_REG);
  if (!landlineMatch) {
    return null;
  }

  return {
    raw: landlineMatch[0],
    value: landlineMatch[1].replace(EXTRA_SPACE_REG, ''),
  };
}

function isLikelyName(token: string) {
  if (!token || token.length < 2 || token.length > 30) {
    return false;
  }
  if (DIGIT_REG.test(token) || ADDRESS_DETAIL_KEYWORD_REG.test(token)) {
    return false;
  }
  return CHINESE_NAME_REG.test(token) || LATIN_NAME_REG.test(token);
}

function extractNameCandidate(text: string) {
  const tokens = text.split(' ').map(cleanupToken).filter(Boolean);

  return tokens.find(isLikelyName) ?? '';
}

function removeFirstOccurrence(text: string, fragment: string) {
  if (!fragment) {
    return text;
  }
  return text.replace(fragment, ' ').replace(EXTRA_SPACE_REG, ' ').trim();
}

function extractRegion(text: string) {
  const provinceMatch = text.match(PROVINCE_REG);

  if (!provinceMatch) {
    return null;
  }

  const province = provinceMatch[1];
  const provinceIndex = provinceMatch.index ?? 0;
  let cursor = provinceIndex + province.length;
  let matchedText = province;
  let city = '';
  let district = '';
  const remainingAfterProvince = text.slice(cursor);

  if (SPECIAL_PROVINCES.includes(province as (typeof SPECIAL_PROVINCES)[number])) {
    city = MUNICIPALITIES.includes(province as (typeof MUNICIPALITIES)[number]) ? province : '';
  } else {
    const cityMatch = remainingAfterProvince.match(CITY_REG);
    if (cityMatch) {
      city = cityMatch[1];
      matchedText += cityMatch[0];
      cursor += cityMatch[0].length;
    }
  }

  const remainingAfterCity = text.slice(cursor);
  const districtMatch = remainingAfterCity.match(DISTRICT_REG);
  if (districtMatch) {
    district = districtMatch[1];
    matchedText += districtMatch[0];
  }

  if (!city && MUNICIPALITIES.includes(province as (typeof MUNICIPALITIES)[number])) {
    city = province;
  }

  return {
    province,
    city,
    district,
    matchedText: matchedText.trim(),
  };
}

export function splitReceiverName(name: string): ReceiverNameParts {
  const receiverName = name.replace(EXTRA_SPACE_REG, ' ').trim();
  if (!receiverName) {
    return {
      receiverName: '',
      lastName: '',
      firstName: '',
    };
  }

  if (LATIN_NAME_REG.test(receiverName) && receiverName.includes(' ')) {
    const [lastName, ...rest] = receiverName.split(' ').filter(Boolean);
    return {
      receiverName,
      lastName: lastName ?? '',
      firstName: rest.join(' '),
    };
  }

  const compoundSurname = COMPOUND_SURNAMES.find(
    (surname) => receiverName.startsWith(surname) && receiverName.length > surname.length,
  );

  if (compoundSurname) {
    return {
      receiverName,
      lastName: compoundSurname,
      firstName: receiverName.slice(compoundSurname.length),
    };
  }

  return {
    receiverName,
    lastName: receiverName.slice(0, 1),
    firstName: receiverName.slice(1),
  };
}

export function parseSmartAddressText(text: string): SmartAddressParseResult {
  const normalizedText = normalizeAddressText(text);
  if (!normalizedText) {
    return {
      receiverName: '',
      lastName: '',
      firstName: '',
      contactPhone: '',
      province: '',
      city: '',
      district: '',
      streetAddress: '',
    };
  }

  let workingText = normalizedText;

  const phone = extractPhone(workingText);
  if (phone) {
    workingText = removeFirstOccurrence(workingText, phone.raw);
  }

  const region = extractRegion(workingText);
  if (region?.matchedText) {
    workingText = removeFirstOccurrence(workingText, region.matchedText);
  }

  const nameCandidate = extractNameCandidate(workingText);
  if (nameCandidate) {
    workingText = removeFirstOccurrence(workingText, nameCandidate);
  }

  const streetAddress = normalizeStreetAddress(workingText);
  const nameParts = splitReceiverName(nameCandidate);

  return {
    ...nameParts,
    contactPhone: phone?.value ?? '',
    province: region?.province ?? '',
    city: region?.city ?? '',
    district: region?.district ?? '',
    streetAddress,
  };
}

<script setup lang="ts">
import { ref, computed } from 'vue';
import { onLoad } from '@dcloudio/uni-app';

import TIcon from '@tdesign/uniapp/icon/icon.vue';
import TCascader from '@tdesign/uniapp/cascader/cascader.vue';
import { addressApi } from '@/api/modules/address';
import { parseSmartAddressText, splitReceiverName } from '@/helpers/address';
import { guardCurrentPageAccess } from '@/helpers/auth';
import { sendRequest, useQuery } from '@/hooks/useRequest';
import type {
  UserAddressUpsertRequest,
  AddressEntryResponse,
  UserAddressResponse,
} from '@halo-dev/api-client';

interface CascaderOption {
  code: string;
  name: string;
  children?: CascaderOption[];
}

// Full validation: mobile number or landline number (area code-number)
const PHONE_FULL_REG = /^(?:1[3-9]\d{9}|0\d{2,3}[-\s]?\d{7,8})$/;

const addressId = ref<number | null>(null);
const isEdit = computed(() => addressId.value != null);

let _loadOptions: Record<string, string> | undefined;

onLoad(async (options) => {
  if (!guardCurrentPageAccess()) {
    return;
  }
  if (options?.id) {
    addressId.value = Number(options.id);
  }
  uni.setNavigationBarTitle({ title: isEdit.value ? '编辑收货地址' : '新增收货地址' });
  if (isEdit.value) {
    await loadAddressDetail();
  }
  _loadOptions = options as Record<string, string> | undefined;
  await loadProvinces();
  await applyImportOptions();
});

const form = ref<UserAddressUpsertRequest>({
  firstName: '',
  lastName: '',
  contactPhone: '',
  provinceCode: '',
  cityCode: '',
  districtCode: '',
  streetAddress: '',
  postalCode: '',
  isDefault: false,
});

const regionNames = ref({ province: '', city: '', district: '' });
const { run: runProvincesQuery } = useQuery<AddressEntryResponse[], Record<string, never>>(
  () => addressApi.getProvinces(),
  { immediate: false },
);
const { run: runCitiesQuery } = useQuery<AddressEntryResponse[], { provinceCode: string }>(
  (params) => addressApi.getCities(params.provinceCode),
  { immediate: false },
);
const { run: runAreasQuery } = useQuery<AddressEntryResponse[], { cityCode: string }>(
  (params) => addressApi.getAreas(params.cityCode),
  { immediate: false },
);
const { run: runAddressDetailQuery } = useQuery<UserAddressResponse, { id: number }>(
  (params: { id: number }) => addressApi.getAddress(params.id),
  { immediate: false },
);

// Cascader option tree: province -> city -> district, with children loaded lazily
const cascaderOptions = ref<CascaderOption[]>([]);
const cascaderVisible = ref(false);
const cascaderValue = computed(() => form.value.districtCode || '');

// Convert AddressEntry into a Cascader option (with empty children as a placeholder)
function toCascaderOption(entry: AddressEntryResponse, withChildren = true): CascaderOption {
  return {
    code: entry.code ?? '',
    name: entry.name ?? '',
    children: withChildren ? [] : undefined,
  };
}

const regionDisplayText = computed(() => {
  const parts = [
    regionNames.value.province,
    regionNames.value.city,
    regionNames.value.district,
  ].filter(Boolean);
  return parts.join(' ');
});

async function loadProvinces() {
  try {
    const data = await runProvincesQuery({});
    const list = data ?? [];
    cascaderOptions.value = list.map((p) => toCascaderOption(p));
    if (form.value.provinceCode) {
      await loadCitiesForOption(form.value.provinceCode);
      if (form.value.cityCode) {
        await loadAreasForOption(form.value.cityCode);
      }
    }
  } catch {
    // ignore
  }
}

/**
 * Match province/city/district names to codes and prefill the region selector
 * uni.chooseAddress returns display names, so the matching codes must be found in the address tree
 */
async function prefillRegionByName(provinceName: string, cityName: string, districtName: string) {
  try {
    const province = cascaderOptions.value.find(
      (p) =>
        p.name === provinceName ||
        provinceName.startsWith(p.name) ||
        p.name.startsWith(provinceName.slice(0, 2)),
    );
    if (!province) {
      return;
    }

    await loadCitiesForOption(province.code);
    const city = province.children?.find(
      (c) =>
        c.name === cityName ||
        cityName.startsWith(c.name) ||
        c.name.startsWith(cityName.slice(0, 2)),
    );
    if (!city) {
      form.value.provinceCode = province.code;
      regionNames.value.province = province.name;
      return;
    }

    await loadAreasForOption(city.code);
    const district = city.children?.find(
      (d) =>
        d.name === districtName ||
        districtName.startsWith(d.name) ||
        d.name.startsWith(districtName.slice(0, 2)),
    );

    form.value.provinceCode = province.code;
    form.value.cityCode = city.code;
    form.value.districtCode = district?.code ?? '';
    regionNames.value = {
      province: province.name,
      city: city.name,
      district: district?.name ?? '',
    };
  } catch {
    // ignore
  }
}

/**
 * Prefill the form with imported values from uni.chooseAddress
 */
async function applyImportOptions() {
  const options = _loadOptions;
  if (!options) {
    return;
  }

  if (options.importName) {
    const nameParts = splitReceiverName(decodeURIComponent(options.importName));
    form.value.lastName = nameParts.lastName;
    form.value.firstName = nameParts.firstName;
  }
  if (options.importPhone) {
    form.value.contactPhone = decodeURIComponent(options.importPhone);
  }
  if (options.importStreet) {
    form.value.streetAddress = decodeURIComponent(options.importStreet);
  }
  if (options.importPostalCode) {
    form.value.postalCode = decodeURIComponent(options.importPostalCode);
  }
  if (options.importProvince && options.importCity && options.importDistrict) {
    await prefillRegionByName(
      decodeURIComponent(options.importProvince),
      decodeURIComponent(options.importCity),
      decodeURIComponent(options.importDistrict),
    );
  }
}

/**
 * Load cities for the specified province and write them into children
 */
async function loadCitiesForOption(provinceCode: string) {
  try {
    const data = await runCitiesQuery({ provinceCode });
    const list = (data ?? []).map((c) => toCascaderOption(c));
    const province = cascaderOptions.value.find((p) => p.code === provinceCode);
    if (province) {
      province.children = list;
    }
    cascaderOptions.value = [...cascaderOptions.value];
  } catch {
    const province = cascaderOptions.value.find((p) => p.code === provinceCode);
    if (province) {
      province.children = [];
    }
  }
  cascaderOptions.value = [...cascaderOptions.value];
}

/**
 * Load districts/counties for the specified city and write them into children
 */
async function loadAreasForOption(cityCode: string) {
  try {
    const data = await runAreasQuery({ cityCode });
    const list = (data ?? []).map((a) => toCascaderOption(a, false));
    for (const province of cascaderOptions.value) {
      const city = province.children?.find((c) => c.code === cityCode);
      if (city) {
        city.children = list;
        break;
      }
    }
    cascaderOptions.value = [...cascaderOptions.value];
  } catch {
    for (const province of cascaderOptions.value) {
      const city = province.children?.find((c) => c.code === cityCode);
      if (city) {
        city.children = [];
        break;
      }
    }
    cascaderOptions.value = [...cascaderOptions.value];
  }
}

/**
 * Lazily load the next level when a level is selected
 */
function onCascaderPick(e: { value: string | number; label: string; level: number }) {
  const code = String(e.value);
  if (e.level === 0) {
    loadCitiesForOption(code);
  } else if (e.level === 1) {
    loadAreasForOption(code);
  }
}

/**
 * After selection, write values back to the form (selectedOptions contains the selected items at each level, with value/label)
 */
function onCascaderChange(e: {
  value: string | number;
  selectedOptions: Array<{
    value?: string;
    label?: string;
    code?: string;
    name?: string;
  }>;
}) {
  const opts = e.selectedOptions;
  if (opts && opts.length >= 3) {
    const getCode = (o: (typeof opts)[0]) => String(o?.value ?? o?.code ?? '');
    const getName = (o: (typeof opts)[0]) => String(o?.label ?? o?.name ?? '');
    form.value.provinceCode = getCode(opts[0]);
    form.value.cityCode = getCode(opts[1]);
    form.value.districtCode = getCode(opts[2]);
    regionNames.value = {
      province: getName(opts[0]),
      city: getName(opts[1]),
      district: getName(opts[2]),
    };
  }
}

/**
 * Load address details
 */
async function loadAddressDetail() {
  if (!addressId.value) {
    return;
  }
  try {
    const data = await runAddressDetailQuery({ id: addressId.value });
    if (data) {
      form.value = {
        firstName: data.firstName ?? '',
        lastName: data.lastName ?? '',
        contactPhone: data.contactPhone ?? '',
        provinceCode: data.provinceCode ?? '',
        cityCode: data.cityCode ?? '',
        districtCode: data.districtCode ?? '',
        streetAddress: data.streetAddress ?? '',
        postalCode: data.postalCode ?? '',
        isDefault: data.isDefault ?? false,
      };
      regionNames.value = {
        province: data.province ?? '',
        city: data.city ?? '',
        district: data.district ?? '',
      };
    }
  } catch {
    uni.showToast({ title: '加载地址失败', icon: 'none' });
  }
}

/**
 * Smart paste recognition
 */
const pasteText = ref('');

async function parseAddressText() {
  if (!pasteText.value.trim()) {
    uni.showToast({ title: '请先输入地址文本', icon: 'none' });
    return;
  }

  const parsed = parseSmartAddressText(pasteText.value);
  const hasMatchedField = [
    parsed.receiverName,
    parsed.contactPhone,
    parsed.postalCode,
    parsed.streetAddress,
    parsed.province,
    parsed.city,
    parsed.district,
  ].some(Boolean);

  if (!hasMatchedField) {
    uni.showToast({ title: '暂未识别到有效地址信息', icon: 'none' });
    return;
  }

  if (parsed.lastName || parsed.firstName) {
    form.value.lastName = parsed.lastName;
    form.value.firstName = parsed.firstName;
  }
  if (parsed.contactPhone) {
    form.value.contactPhone = parsed.contactPhone;
  }
  if (parsed.postalCode) {
    form.value.postalCode = parsed.postalCode;
  }
  if (parsed.streetAddress) {
    form.value.streetAddress = parsed.streetAddress;
  }
  if (parsed.province && parsed.city) {
    await prefillRegionByName(parsed.province, parsed.city, parsed.district);
  }

  uni.showToast({ title: '识别完成，请核对信息', icon: 'none' });
}

function validateForm(): boolean {
  const name = `${form.value.lastName}${form.value.firstName}`.trim();
  if (!name) {
    uni.showToast({ title: '请填写收货人姓名', icon: 'none' });
    return false;
  }
  if (!form.value.contactPhone) {
    uni.showToast({ title: '请填写手机号码', icon: 'none' });
    return false;
  }
  if (!PHONE_FULL_REG.test(form.value.contactPhone)) {
    uni.showToast({ title: '手机号或座机号格式不正确', icon: 'none' });
    return false;
  }
  if (!form.value.provinceCode || !form.value.cityCode || !form.value.districtCode) {
    uni.showToast({ title: '请选择所在地区', icon: 'none' });
    return false;
  }
  if (!form.value.streetAddress.trim()) {
    uni.showToast({ title: '请填写详细地址', icon: 'none' });
    return false;
  }
  if (!form.value.postalCode?.trim()) {
    uni.showToast({ title: '请填写邮政编码', icon: 'none' });
    return false;
  }
  return true;
}

const submitting = ref(false);

async function handleSave() {
  if (submitting.value) {
    return;
  }
  if (!validateForm()) {
    return;
  }
  submitting.value = true;
  try {
    if (isEdit.value && addressId.value != null) {
      await sendRequest(addressApi.updateAddress(addressId.value, form.value));
    } else {
      await sendRequest(addressApi.createAddress(form.value));
    }
    uni.showToast({ title: '保存成功', icon: 'success' });
    setTimeout(() => uni.navigateBack(), 1200);
  } catch {
    uni.showToast({ title: '保存失败，请重试', icon: 'none' });
  } finally {
    submitting.value = false;
  }
}

/**
 * Name input helper
 *
 * Merge the recipient name into a single input (lastName initial + remaining firstName)
 */
const fullName = computed({
  get() {
    return `${form.value.lastName}${form.value.firstName}`;
  },
  set(val: string) {
    const nameParts = splitReceiverName(val);
    form.value.lastName = nameParts.lastName;
    form.value.firstName = nameParts.firstName;
  },
});
</script>

<template>
  <view class="flex flex-col min-h-screen bg-bg-page">
    <scroll-view scroll-y class="flex-1 pb-30" style="padding-bottom: 240rpx">
      <view class="flex flex-col gap-3 pt-2">
        <view class="bg-white flex flex-col">
          <view class="flex items-center px-4 py-4.25 border-b border-solid border-slate-50">
            <view class="shrink-0 w-24">
              <text class="text-slate-700 text-base">收货人</text>
            </view>
            <input
              v-model="fullName"
              class="flex-1 text-base text-slate-950 min-w-0"
              placeholder="请填写收货人姓名"
              placeholder-style="color: #94a3b8"
              :maxlength="20"
            />
          </view>

          <view class="flex items-center px-4 py-4.25 border-b border-solid border-slate-50">
            <view class="shrink-0 w-24">
              <text class="text-slate-700 text-base">手机号码</text>
            </view>
            <input
              v-model="form.contactPhone"
              class="flex-1 text-base text-slate-950 min-w-0"
              placeholder="请填写收货人手机号"
              placeholder-style="color: #94a3b8"
              type="number"
              :maxlength="11"
            />
          </view>

          <view
            class="flex items-center px-4 py-4 border-b border-solid border-slate-50"
            @tap="cascaderVisible = true"
          >
            <view class="shrink-0 w-24">
              <text class="text-slate-700 text-base">所在地区</text>
            </view>
            <view class="flex-1 flex items-center justify-between min-w-0">
              <text
                :class="regionDisplayText ? 'text-slate-950' : 'text-slate-400'"
                class="text-base"
              >
                {{ regionDisplayText || '选择省、市、区/县' }}
              </text>
              <TIcon name="chevron-right" v-bind="{ size: '24rpx', color: '#94a3b8' }" />
            </view>
          </view>
          <TCascader
            v-model:visible="cascaderVisible"
            :options="cascaderOptions"
            :value="cascaderValue"
            title="选择所在地区"
            placeholder="选择省、市、区/县"
            :keys="{ value: 'code', label: 'name', children: 'children' }"
            @pick="onCascaderPick"
            @change="(e: any) => onCascaderChange(e)"
          />

          <view class="flex items-start p-4 border-b border-solid border-slate-50">
            <view class="shrink-0 pt-0.5 w-24">
              <text class="text-slate-700 text-base">详细地址</text>
            </view>
            <textarea
              v-model="form.streetAddress"
              class="flex-1 text-base text-slate-950 min-w-0 h-20 line-height-relaxed"
              placeholder="街道门牌、楼层房间号等信息"
              placeholder-style="color: #94a3b8"
              :maxlength="200"
              auto-height
            />
          </view>

          <view class="flex items-start p-4 border-b border-solid border-slate-50">
            <view class="shrink-0 pt-0.5 w-24">
              <text class="text-slate-700 text-base">邮政编码</text>
            </view>
            <input
              v-model="form.postalCode"
              class="flex-1 text-base text-slate-950 min-w-0"
              placeholder="请填写邮政编码"
              placeholder-style="color: #94a3b8"
              type="number"
              :maxlength="6"
            />
          </view>
        </view>
        <view class="bg-white flex items-center justify-between px-4 py-4">
          <text class="text-slate-900 text-base">设为默认地址</text>
          <switch
            :checked="form.isDefault"
            color="#ee2b2b"
            style="transform: scale(0.85)"
            @change="(e: any) => (form.isDefault = e.detail.value)"
          />
        </view>

        <view class="bg-slate-50 flex flex-col gap-2 px-4 py-5">
          <text class="text-slate-500 text-xs">粘贴整段文字，自动识别姓名、电话和地址</text>
          <textarea
            v-model="pasteText"
            class="w-full text-xs text-slate-700 h-15 line-height-relaxed bg-transparent"
            placeholder="例如：张三，13800138000，浙江省杭州市西湖区..."
            placeholder-style="color: #94a3b8; font-size: 26rpx"
            :maxlength="500"
          />
          <view class="flex justify-end">
            <view
              class="flex items-center justify-center border border-solid border-brand/30 rounded-full px-3 py-1"
              @tap="parseAddressText"
            >
              <text class="text-brand text-xs">识别</text>
            </view>
          </view>
        </view>
      </view>
    </scroll-view>

    <view
      class="fixed bottom-0 left-0 right-0 z-10 bg-white border-t border-solid border-slate-100 p-4 pb-safe"
    >
      <view
        class="flex items-center justify-center rounded-full py-3 shadow-brand-btn"
        :class="submitting ? 'opacity-60 bg-brand' : 'bg-brand'"
        @tap="handleSave"
      >
        <text class="text-white text-base font-medium">
          {{ submitting ? '保存中...' : '确认保存' }}
        </text>
      </view>
    </view>
  </view>
</template>

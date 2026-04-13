<script setup lang="ts">
import { ref, watch, onMounted } from 'vue';
import TIcon from '@tdesign/uniapp/icon/icon.vue';
import { ICON_COLOR } from '@/helpers/icon';
import { formatImageUrlWithThumbnail, getThumbnailUrl } from '@/helpers/image';
import { openLegalDocument } from '@/helpers/legal';
import { useAppConfig } from '@/config';
import { useAuth } from '@/hooks/useAuth';
import { useUserStore } from '@/store';
import { isAnonymousUser } from '@/store/modules/user';
import { authApi } from '@/api';
import { sendRequest } from '@/hooks/useRequest';
import type { LoginMethod } from '@/config/types';
import type { User } from '@halo-dev/api-client';
import LoginMethodPhoneCode from './login/LoginMethodPhoneCode.vue';
import LoginMethodEmail from './login/LoginMethodEmail.vue';
import LoginMethodHaloAccount from './login/LoginMethodHaloAccount.vue';
import LoginMethodHaloPat from './login/LoginMethodHaloPat.vue';

const props = withDefaults(
  defineProps<{
    mode?: 'drawer' | 'page';
    forceMethods?: boolean;
    showClose?: boolean;
  }>(),
  {
    mode: 'page',
    forceMethods: false,
    showClose: false,
  },
);

const emit = defineEmits<{
  success: [];
  close: [];
}>();

const appConfig = useAppConfig();
const { onLoginSuccess, syncProfile } = useAuth();
const userStore = useUserStore();

type PanelView = 'loading' | 'bound' | 'methods';

const panelView = ref<PanelView>('loading');
const boundResult = ref<{ user: User | null } | null>(null);
const activeMethod = ref<LoginMethod | null>(null);
const agreed = ref(false);
const boundLoading = ref(false);

const loginMethods = appConfig.auth.loginMethods;

interface MethodMeta {
  label: string;
  icon: string;
  desc?: string;
}

const methodMeta: Record<LoginMethod, MethodMeta> = {
  phoneQuick: { label: '手机号一键登录', icon: 'mobile', desc: '使用微信绑定手机号快速登录' },
  phoneCode: { label: ' 其他手机号登录', icon: 'mobile', desc: '使用手机号及短信验证码登录' },
  email: { label: '邮箱登录', icon: 'mail', desc: '使用邮箱及验证码登录' },
  haloAccount: { label: 'Halo 账号登录', icon: 'user-circle', desc: '使用 Halo 账号和密码登录' },
  haloPat: { label: 'PAT 登录', icon: 'lock-on', desc: '使用 Personal Access Token 登录' },
};

function resetState() {
  agreed.value = false;
  boundLoading.value = false;
  activeMethod.value = null;
  panelView.value = 'loading';
  boundResult.value = null;
}

async function initializeView(forceMethods = false) {
  resetState();

  if (forceMethods) {
    userStore.setProfile(null);
    panelView.value = 'methods';
    return;
  }

  try {
    const user = await syncProfile();
    if (!isAnonymousUser(user)) {
      boundResult.value = { user };
      panelView.value = 'bound';
      return;
    }

    userStore.setProfile(null);
  } catch {
    userStore.setProfile(null);
  }

  boundResult.value = null;
  panelView.value = 'methods';
}

watch(
  () => props.forceMethods,
  (forceMethods, previousValue) => {
    if (forceMethods && forceMethods !== previousValue) {
      initializeView(true);
    }
  },
);

onMounted(() => {
  initializeView(props.forceMethods);
});

function close() {
  emit('close');
}

function onToggleAgree() {
  agreed.value = !agreed.value;
}

function onAgreementTap(type: 'user' | 'privacy') {
  openLegalDocument(type === 'user' ? 'userAgreement' : 'privacyPolicy');
}

function selectMethod(method: LoginMethod) {
  activeMethod.value = method;
}

function backToMethods() {
  activeMethod.value = null;
}

function switchToMethods() {
  panelView.value = 'methods';
  activeMethod.value = null;
}

async function handleLoginResult(result: any) {
  await onLoginSuccess(result);
  emit('success');
}

const systemInfo = uni.getSystemInfoSync();
const uniPlatform = systemInfo.uniPlatform ?? '';

async function handlePhoneQuickResult(e: any) {
  if (!agreed.value) {
    uni.showToast({ title: '请先阅读并同意相关协议', icon: 'none' });
    return;
  }
  const phoneCode = e?.detail?.code;
  if (!phoneCode) {
    const errno = e?.detail?.errno;
    if (errno !== 1) {
      uni.showToast({ title: '获取手机号失败，请重试', icon: 'none' });
    }
    return;
  }
  boundLoading.value = true;
  try {
    const result = await sendRequest(
      authApi.loginByPhoneQuick({
        phoneCode,
        platform: uniPlatform,
      }),
    );
    await handleLoginResult(result);
  } catch {
    uni.showToast({ title: '登录失败，请稍后重试', icon: 'none' });
  } finally {
    boundLoading.value = false;
  }
}

function onPrimaryPhoneQuick(e: any) {
  handlePhoneQuickResult(e);
}

function onSecondaryPhoneQuick(e: any) {
  handlePhoneQuickResult(e);
}

function handleBoundLogin() {
  if (!agreed.value) {
    uni.showToast({ title: '请先阅读并同意相关协议', icon: 'none' });
    return;
  }
  if (!boundResult.value?.user) {
    return;
  }
  userStore.setHasLogin(true);
  userStore.setProfile(boundResult.value.user);
  emit('success');
}

const panelClass = props.mode === 'drawer' ? 'rounded-t-5' : 'min-h-screen';
</script>

<template>
  <view class="bg-white w-full flex flex-col" :class="panelClass">
    <view
      v-if="props.mode === 'drawer'"
      class="flex items-center justify-center pt-3 pb-2 shrink-0"
    >
      <view class="bg-slate-200 rounded-full w-10 h-1" />
    </view>

    <view
      v-if="props.showClose"
      class="flex justify-end px-5"
      :class="props.mode === 'drawer' ? 'pt-1 pb-2' : 'pt-4 pb-2'"
    >
      <view class="w-8 h-8 rounded-full bg-slate-100 flex items-center justify-center" @tap="close">
        <TIcon name="close" v-bind="{ size: '32rpx', color: ICON_COLOR.muted }" />
      </view>
    </view>

    <view
      class="flex flex-col items-center gap-3"
      :class="props.mode === 'drawer' ? 'py-2' : 'px-6 pt-16 pb-4'"
    >
      <view
        class="w-16 h-16 rounded-4 flex items-center justify-center bg-brand overflow-hidden shadow-brand"
      >
        <image
          v-if="appConfig.app.logo"
          :src="getThumbnailUrl(appConfig.app.logo, 'S')"
          mode="aspectFit"
          class="w-full h-full"
        />
        <TIcon v-else name="shop" v-bind="{ size: '68rpx', color: ICON_COLOR.inverse }" />
      </view>
      <text class="text-slate-950 text-xl font-bold">{{ appConfig.app.name }}</text>
    </view>

    <view v-if="panelView === 'loading'" class="flex flex-col items-center gap-3 py-10 px-6">
      <view
        class="w-10 h-10 rounded-full border-4 border-brand border-t-transparent animate-spin"
      />
      <text class="text-slate-400 text-sm">正在验证身份，请稍候…</text>
    </view>

    <view v-else-if="panelView === 'bound'" class="flex flex-col px-6 pt-3 gap-3">
      <view
        class="flex items-center gap-3 px-4 py-3.5 rounded-3 bg-slate-50 border border-solid border-brand/20"
      >
        <view
          class="w-12 h-12 rounded-full bg-slate-200 flex items-center justify-center shrink-0 overflow-hidden"
        >
          <image
            v-if="boundResult?.user?.spec?.avatar"
            :src="formatImageUrlWithThumbnail(boundResult.user.spec.avatar, 'S')"
            mode="aspectFill"
            class="w-full h-full"
          />
          <TIcon v-else name="user-filled" v-bind="{ size: '48rpx', color: ICON_COLOR.muted }" />
        </view>
        <view class="flex flex-col flex-1 min-w-0 gap-0.5">
          <text class="text-slate-950 text-sm font-semibold truncate">
            {{ boundResult?.user?.spec?.displayName ?? '未知用户' }}
          </text>
          <text v-if="boundResult?.user?.spec?.email" class="text-slate-400 text-xs truncate">
            {{ boundResult.user.spec.email }}
          </text>
        </view>
        <view class="px-2 py-1 rounded-full bg-green-50 shrink-0">
          <text class="text-green-600 text-xs">已关联</text>
        </view>
      </view>

      <view
        class="w-full flex items-center justify-center rounded-full py-3.5 mt-1"
        :class="agreed ? 'bg-brand' : 'bg-brand-muted'"
        :style="{ opacity: boundLoading ? '0.7' : '1' }"
        @tap="handleBoundLogin"
      >
        <text class="text-white text-base font-bold">
          {{ boundLoading ? '登录中…' : '一键登录' }}
        </text>
      </view>

      <view class="flex items-center justify-center py-1" @tap="switchToMethods">
        <text class="text-brand text-sm font-medium">使用其他方式登录</text>
      </view>
    </view>

    <view v-else-if="panelView === 'methods'" class="flex flex-col px-6 pt-2 gap-3">
      <view v-if="activeMethod === null" class="flex flex-col gap-4">
        <!-- #ifdef MP-WEIXIN -->
        <button
          v-if="loginMethods.primary === 'phoneQuick'"
          open-type="getPhoneNumber"
          class="w-full flex items-center justify-center gap-2 rounded-full py-4 bg-brand!"
          :class="agreed ? '' : 'opacity-60'"
          :disabled="!agreed"
          @getphonenumber="onPrimaryPhoneQuick"
        >
          <text class="text-white text-base font-bold">
            {{ methodMeta[loginMethods.primary].label }}
          </text>
        </button>
        <!-- #endif -->
        <!-- #ifndef MP-WEIXIN -->
        <view
          v-if="loginMethods.primary === 'phoneQuick'"
          class="w-full flex items-center justify-center gap-2 rounded-full py-4 bg-brand-muted"
        >
          <text class="text-white text-base font-bold">手机号一键登录（仅微信可用）</text>
        </view>
        <!-- #endif -->
        <view
          v-if="loginMethods.primary !== 'phoneQuick'"
          class="w-full flex items-center justify-center gap-2 rounded-full py-4 bg-brand active:opacity-80"
          @tap="selectMethod(loginMethods.primary)"
        >
          <TIcon
            :name="methodMeta[loginMethods.primary].icon"
            v-bind="{ size: '40rpx', color: ICON_COLOR.inverse }"
          />
          <text class="text-white text-base font-bold">
            {{ methodMeta[loginMethods.primary].label }}
          </text>
        </view>

        <view
          v-if="loginMethods.supported.filter((m) => m !== loginMethods.primary).length > 0"
          class="flex flex-col gap-3"
        >
          <view class="flex items-center gap-3">
            <view class="flex-1 h-[1rpx] bg-slate-100" />
            <text class="text-slate-400 text-xs shrink-0">其他登录方式</text>
            <view class="flex-1 h-[1rpx] bg-slate-100" />
          </view>
          <view class="flex items-center justify-center gap-6">
            <view
              v-for="method in loginMethods.supported.filter((m) => m !== loginMethods.primary)"
              :key="method"
              class="flex flex-col items-center gap-1.5"
            >
              <!-- #ifdef MP-WEIXIN -->
              <button
                v-if="method === 'phoneQuick'"
                open-type="getPhoneNumber"
                class="flex flex-col items-center gap-1.5 bg-transparent p-0"
                :disabled="!agreed"
                @getphonenumber="onSecondaryPhoneQuick"
              >
                <view
                  class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center"
                  :class="!agreed ? 'opacity-40' : ''"
                >
                  <TIcon
                    :name="methodMeta[method].icon"
                    v-bind="{ size: '44rpx', color: ICON_COLOR.default }"
                  />
                </view>
                <text class="text-slate-500 text-xs">{{ methodMeta[method].label }}</text>
              </button>
              <!-- #endif -->
              <view
                v-if="method !== 'phoneQuick'"
                class="flex flex-col items-center gap-1.5 active:opacity-70"
                @tap="selectMethod(method)"
              >
                <view class="w-12 h-12 rounded-full bg-slate-100 flex items-center justify-center">
                  <TIcon
                    :name="methodMeta[method].icon"
                    v-bind="{ size: '44rpx', color: ICON_COLOR.default }"
                  />
                </view>
                <text class="text-slate-500 text-xs">{{ methodMeta[method].label }}</text>
              </view>
            </view>
          </view>
        </view>
      </view>

      <view v-else class="flex flex-col gap-3">
        <view class="flex items-center gap-2 mb-1">
          <view
            class="w-7 h-7 rounded-full bg-slate-100 flex items-center justify-center"
            @tap="backToMethods"
          >
            <TIcon name="chevron-left" v-bind="{ size: '28rpx', color: ICON_COLOR.default }" />
          </view>
          <text class="text-slate-900 font-semibold text-sm">
            {{ methodMeta[activeMethod].label }}
          </text>
        </view>

        <LoginMethodPhoneCode
          v-if="activeMethod === 'phoneCode'"
          :agreed="agreed"
          @success="handleLoginResult"
        />
        <LoginMethodEmail
          v-else-if="activeMethod === 'email'"
          :agreed="agreed"
          @success="handleLoginResult"
        />
        <LoginMethodHaloAccount
          v-else-if="activeMethod === 'haloAccount'"
          :agreed="agreed"
          @success="handleLoginResult"
        />
        <LoginMethodHaloPat
          v-else-if="activeMethod === 'haloPat'"
          :agreed="agreed"
          @success="handleLoginResult"
        />
      </view>
    </view>

    <view v-if="panelView !== 'loading'" class="flex items-center gap-1 px-6 pt-4 pb-1">
      <view
        class="w-3 h-3 rounded-full border-2 border-solid shrink-0 flex items-center justify-center"
        :class="agreed ? 'bg-brand border-brand' : 'bg-white border-slate-300'"
        @tap="onToggleAgree"
      >
        <TIcon name="check" v-bind="{ size: '24rpx', color: ICON_COLOR.inverse }" />
      </view>
      <view class="flex flex-wrap items-center line-height-tight">
        <text class="text-slate-500 text-xs">已阅读并同意</text>
        <text class="text-brand text-xs font-medium" @tap.stop="onAgreementTap('user')">
          《用户协议》
        </text>
        <text class="text-slate-500 text-xs">和</text>
        <text class="text-brand text-xs font-medium" @tap.stop="onAgreementTap('privacy')">
          《隐私政策》
        </text>
      </view>
    </view>

    <view class="pb-safe-sm" />
  </view>
</template>

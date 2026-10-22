import { ref } from 'vue';
import type { CouponResponse, CustomerCouponResponse } from '@halo-dev/api-client';
import { couponApi } from '@/api/modules/coupon';
import { sendRequest } from '@/hooks/useRequest';

export function useCoupons() {
  const mine = ref<CustomerCouponResponse[]>([]);
  const claimable = ref<CouponResponse[]>([]);
  const loading = ref(false);
  const failed = ref(false);
  const unsupported = ref(false);
  const claimingId = ref<number | null>(null);
  let generation = 0;

  async function refresh() {
    const token = ++generation;
    loading.value = true;
    failed.value = false;
    try {
      const [wallet, offers] = await Promise.all([
        sendRequest(couponApi.listMine()),
        sendRequest(couponApi.listClaimable()),
      ]);
      if (token !== generation) {
        return;
      }
      unsupported.value = !Array.isArray(wallet) || !Array.isArray(offers);
      mine.value = Array.isArray(wallet) ? wallet : [];
      claimable.value = Array.isArray(offers) ? offers : [];
    } catch {
      if (token === generation) {
        failed.value = true;
      }
    } finally {
      if (token === generation) {
        loading.value = false;
      }
    }
  }

  async function claim(id: number) {
    if (claimingId.value !== null) {
      return false;
    }
    claimingId.value = id;
    try {
      await sendRequest(couponApi.claim(id));
      await refresh();
      return true;
    } catch {
      return false;
    } finally {
      claimingId.value = null;
    }
  }

  return { mine, claimable, loading, failed, unsupported, claimingId, refresh, claim };
}

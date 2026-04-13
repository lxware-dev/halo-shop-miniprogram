// axios stub for miniprogram environment
// @halo-dev/api-client depends on axios, but Mini Program does not support it,
// this project uses alova + the uniapp adapter for requests, and this file only prevents build errors
const axiosStub = {
  create: () => axiosStub,
  get: () => axiosStub,
  post: () => axiosStub,
  put: () => axiosStub,
  patch: () => axiosStub,
  delete: () => axiosStub,
  head: () => axiosStub,
  options: () => axiosStub,
  request: () => axiosStub,
  interceptors: {
    request: { use: () => axiosStub, eject: () => axiosStub },
    response: { use: () => axiosStub, eject: () => axiosStub },
  },
  defaults: { headers: { common: {} } },
};

export const axios = axiosStub;
export default axiosStub;

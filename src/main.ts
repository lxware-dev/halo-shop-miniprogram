import { createSSRApp } from 'vue';
import App from './App.vue';
import pinia from './store/index';

import 'virtual:uno.css';
import '@tdesign/uniapp/common/style/theme/index.css';

export function createApp() {
  const app = createSSRApp(App);
  app.use(pinia);
  return { app };
}

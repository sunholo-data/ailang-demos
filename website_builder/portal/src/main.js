import { createApp } from 'vue';
import App from './App.vue';
import { initFirebase } from './firebase.js';
import { loadApiKeyFromHash } from './ailang.js';

// Pre-populate Gemini API key if passed via URL hash (from launch script)
loadApiKeyFromHash();

// Try to initialize Firebase (fails gracefully in dev without config)
initFirebase();

createApp(App).mount('#app');

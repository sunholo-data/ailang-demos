<template>
  <div class="auth-gate">
    <div class="auth-card">
      <div class="brand">
        <span class="brand-icon">🌐</span>
        <h1>Website Builder</h1>
        <p>Turn your photos, documents, and ideas into a beautiful website — powered by AI.</p>
      </div>

      <div v-if="error" class="error-msg">{{ error }}</div>

      <button class="google-btn" :disabled="loading" @click="handleGoogleSignIn">
        <svg width="18" height="18" viewBox="0 0 18 18" fill="none">
          <path d="M17.64 9.2a10.34 10.34 0 0 0-.16-1.84H9v3.48h4.84a4.14 4.14 0 0 1-1.8 2.72v2.26h2.92c1.7-1.57 2.68-3.87 2.68-6.62Z" fill="#4285F4"/>
          <path d="M9 18c2.43 0 4.47-.8 5.96-2.18l-2.91-2.26a5.4 5.4 0 0 1-8.06-2.85H.96v2.33A9 9 0 0 0 9 18Z" fill="#34A853"/>
          <path d="M3.99 10.71a5.38 5.38 0 0 1 0-3.42V4.96H.96a9 9 0 0 0 0 8.08l3.03-2.33Z" fill="#FBBC05"/>
          <path d="M9 3.58c1.32 0 2.5.45 3.44 1.34l2.58-2.58A9 9 0 0 0 .96 4.96l3.03 2.33C4.84 5.34 6.72 3.58 9 3.58Z" fill="#EA4335"/>
        </svg>
        <span>{{ loading ? 'Signing in...' : 'Sign in with Google' }}</span>
      </button>

      <div class="divider"><span>or</span></div>

      <button class="skip-btn" @click="$emit('skip')">
        Continue without signing in
        <span class="note">(dev mode — changes won't be saved)</span>
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';
import { signInWithGoogle, isAllowed } from '../firebase.js';

const emit = defineEmits(['signed-in', 'skip']);
const loading = ref(false);
const error = ref('');

async function handleGoogleSignIn() {
  loading.value = true;
  error.value = '';
  try {
    const user = await signInWithGoogle();
    if (!isAllowed(user)) {
      error.value = 'Sorry, this app is invite-only at the moment.';
      return;
    }
    emit('signed-in', user);
  } catch (err) {
    // Firebase not configured yet — fall back to skip
    if (err.message.includes('not initialized') || err.message.includes('REPLACE_WITH')) {
      emit('skip');
    } else {
      error.value = err.message;
    }
  } finally {
    loading.value = false;
  }
}
</script>

<style scoped>
.auth-gate {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 1rem;
  background: linear-gradient(135deg, #F8F6FF 0%, #EDE8FF 100%);
}

.auth-card {
  background: white;
  border-radius: 20px;
  padding: 2.5rem 2rem;
  max-width: 400px;
  width: 100%;
  box-shadow: 0 8px 32px rgba(124,92,191,0.15);
  text-align: center;
}

.brand { margin-bottom: 2rem; }
.brand-icon { font-size: 3rem; display: block; margin-bottom: 0.75rem; }
.brand h1 { font-size: 1.8rem; color: #7C5CBF; margin-bottom: 0.75rem; }
.brand p { color: #7A7190; line-height: 1.6; font-size: 1rem; }

.error-msg {
  background: #FFF0F0;
  border: 1px solid #FFB3B3;
  border-radius: 8px;
  padding: 0.75rem;
  margin-bottom: 1rem;
  font-size: 0.9rem;
  color: #CC0000;
}

.google-btn {
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 0.75rem;
  width: 100%;
  padding: 0.9rem 1.5rem;
  background: white;
  border: 1.5px solid #DADCE0;
  border-radius: 12px;
  font-size: 1rem;
  font-weight: 500;
  color: #3C4043;
  cursor: pointer;
  transition: background 0.2s, box-shadow 0.2s;
}
.google-btn:hover:not(:disabled) {
  background: #F8F8F8;
  box-shadow: 0 1px 4px rgba(0,0,0,0.1);
}
.google-btn:disabled { opacity: 0.6; cursor: not-allowed; }

.divider {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  margin: 1.25rem 0;
  color: #BDBDBD;
  font-size: 0.85rem;
}
.divider::before, .divider::after {
  content: '';
  flex: 1;
  height: 1px;
  background: #E0E0E0;
}

.skip-btn {
  background: none;
  border: none;
  color: #7A7190;
  cursor: pointer;
  font-size: 0.9rem;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 0.2rem;
  padding: 0.5rem;
  border-radius: 8px;
  transition: background 0.2s;
  width: 100%;
}
.skip-btn:hover { background: #F8F6FF; }
.note { font-size: 0.75rem; color: #BDBDBD; }
</style>

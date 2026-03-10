<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="share-panel">
      <div class="share-header">
        <h2>Share "{{ siteTitle }}"</h2>
        <button class="settings-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="share-body">
        <!-- Add collaborator -->
        <label>Invite by email</label>
        <div class="share-input-row">
          <input
            v-model="email"
            type="email"
            placeholder="name@example.com"
            @keydown.enter="addEmail"
          />
          <button class="btn-primary btn-sm" @click="addEmail" :disabled="!validEmail || adding">
            {{ adding ? '...' : 'Add' }}
          </button>
        </div>
        <p v-if="addError" class="share-error">{{ addError }}</p>

        <!-- Current collaborators -->
        <div v-if="sharedWith.length > 0" class="shared-list">
          <label>Shared with</label>
          <div v-for="e in sharedWith" :key="e" class="shared-item">
            <SvgIcon name="user" :size="14" />
            <span>{{ e }}</span>
            <button class="chip-clear" @click="removeEmail(e)" title="Remove access">
              <SvgIcon name="x" :size="14" />
            </button>
          </div>
        </div>

        <!-- Share link -->
        <label style="margin-top: 1rem">Share link</label>
        <div class="share-link-row">
          <input :value="shareUrl" readonly class="share-link-input" @click="$event.target.select()" />
          <button class="btn-secondary btn-sm" @click="copyLink">
            <SvgIcon :name="copied ? 'check' : 'clipboard'" :size="14" />
            {{ copied ? 'Copied' : 'Copy' }}
          </button>
        </div>

        <!-- Actions -->
        <div class="share-actions">
          <button class="btn-primary" @click="sendEmail">
            <SvgIcon name="mail" :size="16" /> Send via email
          </button>
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, computed, onMounted } from 'vue';
import SvgIcon from './SvgIcon.vue';
import { getSiteMetadata, shareSite, unshareSite } from '../firebase.js';

const props = defineProps({
  ownerUid: { type: String, required: true },
  siteSlug: { type: String, required: true },
  siteTitle: { type: String, default: 'Website' },
  liveUrl: { type: String, default: '' },
});
defineEmits(['close']);

const email = ref('');
const adding = ref(false);
const addError = ref('');
const sharedWith = ref([]);
const copied = ref(false);
let copiedTimer = null;

const validEmail = computed(() => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.value));

const shareUrl = computed(() => {
  const base = window.location.origin + window.location.pathname;
  return `${base}?shared=${props.ownerUid}_${props.siteSlug}`;
});

onMounted(async () => {
  const meta = await getSiteMetadata(props.ownerUid, props.siteSlug);
  if (meta?.sharedWith) sharedWith.value = [...meta.sharedWith];
});

async function addEmail() {
  if (!validEmail.value) return;
  addError.value = '';
  adding.value = true;
  try {
    const addr = email.value.toLowerCase().trim();
    await shareSite(props.ownerUid, props.siteSlug, addr);
    if (!sharedWith.value.includes(addr)) sharedWith.value.push(addr);
    email.value = '';
  } catch (err) {
    addError.value = err.message;
  } finally {
    adding.value = false;
  }
}

async function removeEmail(addr) {
  try {
    await unshareSite(props.ownerUid, props.siteSlug, addr);
    sharedWith.value = sharedWith.value.filter(e => e !== addr);
  } catch (err) {
    addError.value = err.message;
  }
}

async function copyLink() {
  try {
    await navigator.clipboard.writeText(shareUrl.value);
    copied.value = true;
    clearTimeout(copiedTimer);
    copiedTimer = setTimeout(() => { copied.value = false; }, 2000);
  } catch {
    const el = document.querySelector('.share-link-input');
    if (el) { el.select(); document.execCommand('copy'); }
  }
}

function sendEmail() {
  const to = email.value || sharedWith.value[sharedWith.value.length - 1] || '';
  const subject = encodeURIComponent(`Check out "${props.siteTitle}"`);
  const body = encodeURIComponent(
    `I've shared a website with you!\n\nView and leave comments here:\n${shareUrl.value}\n\n` +
    (props.liveUrl ? `Live site: ${props.liveUrl}` : '')
  );
  window.open(`mailto:${to}?subject=${subject}&body=${body}`, '_self');
}
</script>

<style scoped>
.share-panel {
  background: var(--surface);
  border-radius: var(--radius);
  width: 100%;
  max-width: 440px;
  max-height: 90vh;
  box-shadow: var(--shadow-elevated);
  display: flex;
  flex-direction: column;
}
.share-header {
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 1.25rem 1.5rem 0;
}
.share-header h2 { font-size: 1.1rem; margin: 0; }
.share-body {
  padding: 1rem 1.5rem 1.5rem;
  overflow-y: auto;
}
.share-body label {
  display: block;
  font-size: 0.85rem;
  color: var(--text-muted);
  margin-bottom: 0.4rem;
  font-weight: 500;
}
.share-input-row {
  display: flex;
  gap: 0.5rem;
  margin-bottom: 0.5rem;
}
.share-input-row input {
  flex: 1;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 0.65rem 0.75rem;
  font-size: 1rem;
  font-family: inherit;
  outline: none;
}
.share-input-row input:focus { border-color: var(--primary); }
.share-error { font-size: 0.8rem; color: #CC0000; margin: 0.25rem 0 0.5rem; }

.shared-list { margin-top: 0.75rem; }
.shared-item {
  display: flex;
  align-items: center;
  gap: 0.5rem;
  padding: 0.4rem 0;
  font-size: 0.9rem;
  color: var(--text);
}
.shared-item span { flex: 1; }
.chip-clear {
  background: none;
  border: none;
  cursor: pointer;
  color: var(--text-muted);
  padding: 0.2rem;
  border-radius: 4px;
  line-height: 1;
}
.chip-clear:hover { color: #CC0000; background: #FFF0F0; }

.share-link-row {
  display: flex;
  gap: 0.5rem;
}
.share-link-input {
  flex: 1;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font-size: 0.82rem;
  font-family: inherit;
  color: var(--text-muted);
  background: var(--bg);
  outline: none;
  cursor: text;
}

.share-actions {
  margin-top: 1.25rem;
}
.share-actions .btn-primary { width: 100%; display: inline-flex; align-items: center; justify-content: center; gap: 0.4rem; }

.btn-sm {
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  font-family: inherit;
  min-height: 40px;
}

@media (max-width: 600px) {
  .share-panel { max-width: 100%; max-height: 100%; height: 100%; border-radius: 0; }
  .share-header { padding: 1rem 1rem 0; }
  .share-body { padding: 0.75rem 1rem 1.5rem; }
}
</style>

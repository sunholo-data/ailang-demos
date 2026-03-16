<template>
  <div class="step">
    <h1>Who should build it?</h1>
    <p class="subtitle">Each builder brings a different approach. Pick one and let's go!</p>

    <div class="persona-options">
      <label
        v-for="p in personas"
        :key="p.key"
        class="persona-card"
        :class="{ selected: selected === p.key && !p.locked, locked: p.locked }"
      >
        <input type="radio" :value="p.key" v-model="selected" :disabled="p.locked" />
        <img :src="p.avatar" :alt="p.name" class="persona-card-avatar" @error="$event.target.style.display='none'" />
        <div class="persona-card-content">
          <div class="persona-card-top">
            <span class="persona-card-name">{{ p.name }}</span>
            <span class="persona-card-mode">{{ p.desc }}</span>
          </div>
          <p class="persona-card-detail">{{ p.detail }}</p>
        </div>
        <span v-if="!p.locked && selected === p.key" class="selected-check">
          <SvgIcon name="check" :size="12" />
        </span>
        <span v-if="p.locked" class="lock-badge">
          <SvgIcon name="lock" :size="14" />
        </span>

        <!-- Inline unlock: API key -->
        <div v-if="p.locked && p.lockAction === 'apikey'" class="unlock-section" @click.stop>
          <p class="unlock-reason">{{ p.lockReason }}</p>
          <div class="unlock-row">
            <input
              v-model="inlineKeys[p.requires?.provider]"
              type="text"
              inputmode="text"
              autocomplete="off"
              autocorrect="off"
              autocapitalize="off"
              spellcheck="false"
              :placeholder="{ anthropic: 'sk-ant-...', gemini: 'AIza...', openai: 'sk-...' }[p.requires?.provider] || 'API key'"
              class="unlock-input api-key-masked"
              @keydown.enter.stop="unlockByok(p.key)"
            />
            <button class="unlock-btn" :disabled="!(inlineKeys[p.requires?.provider] || '').trim()" @click.stop="unlockByok(p.key)">Unlock</button>
          </div>
        </div>

        <!-- Locked: admin-only -->
        <div v-else-if="p.locked && p.lockAction === 'admin'" class="unlock-section">
          <p class="unlock-reason">{{ p.lockReason }}</p>
        </div>
      </label>
    </div>

    <div class="nav-btns">
      <button class="btn-secondary" @click="$emit('back')">&larr; Back</button>
      <button class="btn-primary" :disabled="!canProceed" @click="$emit('next', selected)">
        Let's build it!
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref, computed } from 'vue';
import SvgIcon from '../SvgIcon.vue';

const props = defineProps({
  selectedPersona: { type: String, default: 'wasm' },
  personas: { type: Array, required: true },
  anthropicKey: { type: String, default: '' },
  geminiKey: { type: String, default: '' },
  openaiKey: { type: String, default: '' },
});
const emit = defineEmits(['next', 'back', 'update:anthropicKey', 'update:geminiKey', 'update:openaiKey']);

const selected = ref(props.selectedPersona);
// Per-provider inline key inputs
const inlineKeys = ref({
  anthropic: props.anthropicKey,
  gemini: props.geminiKey,
  openai: props.openaiKey,
});

const canProceed = computed(() => {
  const p = props.personas.find(p => p.key === selected.value);
  return p && !p.locked;
});

function unlockByok(personaKey) {
  const p = props.personas.find(p => p.key === personaKey);
  const provider = p?.requires?.provider || 'anthropic';
  const key = (inlineKeys.value[provider] || '').trim();
  if (!key) return;
  if (provider === 'anthropic') {
    localStorage.setItem('anthropic-api-key', key);
    emit('update:anthropicKey', key);
  } else if (provider === 'gemini') {
    localStorage.setItem('gemini-api-key', key);
    emit('update:geminiKey', key);
  } else if (provider === 'openai') {
    localStorage.setItem('openai-api-key', key);
    emit('update:openaiKey', key);
  }
  selected.value = personaKey;
}
</script>

<style scoped>
.persona-options {
  display: flex;
  flex-direction: column;
  gap: 0.7rem;
  margin-bottom: 1.5rem;
}

.persona-card {
  display: flex;
  align-items: center;
  gap: 0.85rem;
  padding: 0.85rem;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
  flex-wrap: wrap;
}
.persona-card input[type="radio"] { display: none; }
.persona-card:hover:not(.locked) { border-color: var(--primary-light); transform: translateY(-1px); }
.persona-card:active:not(.locked) { transform: translateY(0); }
.persona-card.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: 0 2px 8px rgba(107,82,163,0.12);
}
.persona-card.locked {
  opacity: 0.55;
  filter: grayscale(35%);
  cursor: default;
}

.persona-card-avatar {
  width: 72px;
  height: 72px;
  border-radius: 50%;
  object-fit: cover;
  flex-shrink: 0;
  box-shadow: 0 2px 8px rgba(0,0,0,0.1);
}

.persona-card-content { flex: 1; min-width: 0; }
.persona-card-top {
  display: flex;
  align-items: baseline;
  gap: 0.5rem;
  margin-bottom: 0.2rem;
  flex-wrap: wrap;
}
.persona-card-name { font-weight: 700; font-size: 1.05rem; }
.persona-card-mode {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--bg);
  padding: 0.1rem 0.45rem;
  border-radius: 6px;
  font-weight: 500;
}
.persona-card-detail {
  font-size: 0.85rem;
  color: var(--text-muted);
  line-height: 1.4;
}

.selected-check {
  position: absolute;
  right: 0.75rem;
  top: 0.75rem;
  color: white;
  background: var(--primary);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-shrink: 0;
}

.lock-badge {
  position: absolute;
  right: 0.75rem;
  top: 0.75rem;
  color: var(--text-muted);
}

/* Unlock section */
.unlock-section {
  width: 100%;
  border-top: 1px solid var(--border);
  margin-top: 0.5rem;
  padding-top: 0.6rem;
}
.unlock-reason {
  font-size: 0.82rem;
  color: var(--text-muted);
  margin-bottom: 0.5rem;
}
.unlock-row {
  display: flex;
  gap: 0.5rem;
}
.unlock-input {
  flex: 1;
  border: 1.5px solid var(--border);
  border-radius: 10px;
  padding: 0.55rem 0.75rem;
  font-size: 0.9rem;
  font-family: inherit;
  outline: none;
  transition: border-color 0.2s, box-shadow 0.2s;
}
.unlock-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }
.api-key-masked {
  -webkit-text-security: disc;
  text-security: disc;
}
.unlock-btn {
  background: var(--primary);
  color: white;
  border: none;
  border-radius: 10px;
  padding: 0.55rem 1rem;
  font-size: 0.85rem;
  font-weight: 600;
  font-family: inherit;
  cursor: pointer;
  white-space: nowrap;
  transition: opacity 0.15s;
}
.unlock-btn:hover:not(:disabled) { opacity: 0.85; }
.unlock-btn:disabled { opacity: 0.5; cursor: not-allowed; }

@media (max-width: 600px) {
  .persona-card { padding: 0.65rem; gap: 0.65rem; }
  .persona-card-avatar { width: 56px; height: 56px; }
  .persona-card-name { font-size: 0.95rem; }
  .persona-card-detail { font-size: 0.8rem; }
  .unlock-input { font-size: 1rem; } /* 16px prevents iOS zoom */
}
</style>

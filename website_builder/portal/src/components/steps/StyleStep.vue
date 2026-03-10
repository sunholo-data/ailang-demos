<template>
  <div class="step">
    <h1>How should it feel?</h1>
    <p class="subtitle">Pick a starting vibe. The AI will take creative direction from this — you can always steer it further once you see the preview.</p>

    <div class="style-options">
      <label
        v-for="style in styles"
        :key="style.id"
        class="style-option"
        :class="{ selected: selectedId === style.id }"
      >
        <input type="radio" :value="style.id" v-model="selectedId" />
        <div class="style-preview" :style="{ background: style.colors[0] }">
          <div class="swatch-row">
            <span v-for="c in style.colors" :key="c" class="swatch" :style="{ background: c }" />
          </div>
          <div class="preview-text" :style="{ fontFamily: style.fontFamily, color: style.colors[3] }">
            <span class="preview-heading">Aa</span>
          </div>
        </div>
        <div class="style-content">
          <div class="style-top">
            <span class="style-icon">{{ style.icon }}</span>
            <span class="style-label">{{ style.label }}</span>
          </div>
          <p class="style-desc">{{ style.description }}</p>
        </div>
      </label>
    </div>

    <div class="custom-section">
      <label class="custom-label">Anything else to add? <span class="optional">(optional)</span></label>
      <textarea
        v-model="notes"
        class="custom-input"
        placeholder='e.g. "More purple, please" or "I love photos of nature" or "Keep it simple"'
        rows="2"
      />
    </div>

    <div class="nav-btns">
      <button class="btn-secondary" @click="$emit('back')">← Back</button>
      <button class="btn-primary" @click="$emit('next', selectedId, notes.trim())">
        Let's build it!
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({
  styleId: { type: String, default: 'warm' },
  customNotes: { type: String, default: '' }
});
defineEmits(['next', 'back']);

const selectedId = ref(props.styleId);
const notes = ref(props.customNotes);

const styles = [
  {
    id: 'warm',
    icon: '☀️',
    label: 'Warm & Friendly',
    description: 'Soft earth tones, rounded corners, welcoming. Feels like a cosy shop you want to spend time in.',
    colors: ['#FDF6EE', '#D4845A', '#8B5E3C', '#3D2B1F'],
    fontFamily: 'Georgia, serif',
  },
  {
    id: 'clean',
    icon: '✨',
    label: 'Clean & Modern',
    description: 'Lots of white space, sharp lines, minimal. Professional without being cold.',
    colors: ['#F8F9FA', '#2D2D2D', '#0066CC', '#111111'],
    fontFamily: '"Helvetica Neue", Arial, sans-serif',
  },
  {
    id: 'bold',
    icon: '⚡',
    label: 'Bold & Vibrant',
    description: 'Strong colours, large typography, energetic. Makes an immediate impression.',
    colors: ['#1A1A2E', '#E94560', '#F5A623', '#FFFFFF'],
    fontFamily: 'Impact, "Arial Black", sans-serif',
  },
  {
    id: 'elegant',
    icon: '🌿',
    label: 'Elegant & Refined',
    description: 'Muted palette, serif fonts, sophisticated. Feels premium and tasteful.',
    colors: ['#F5F0EB', '#8B7355', '#2C2416', '#4A3728'],
    fontFamily: '"Palatino Linotype", Georgia, serif',
  },
  {
    id: 'fun',
    icon: '🎉',
    label: 'Fun & Playful',
    description: 'Bright colours, friendly shapes, casual. Cheerful and approachable.',
    colors: ['#FFF9C4', '#FF6B6B', '#4ECDC4', '#2D3436'],
    fontFamily: '"Comic Sans MS", "Chalkboard SE", cursive',
  },
  {
    id: 'auto',
    icon: '🎲',
    label: 'Surprise me!',
    description: 'Let the AI analyse your content and pick the best style. You can always change it later.',
    colors: ['#F3EEFF', '#6B52A3', '#E8A87C', '#33302E'],
    fontFamily: 'inherit',
  }
];
</script>

<style scoped>
.style-options {
  display: flex;
  flex-direction: column;
  gap: 0.6rem;
  margin-bottom: 1.5rem;
}

.style-option {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 0.75rem;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  cursor: pointer;
  transition: all 0.2s;
  position: relative;
}
.style-option input[type="radio"] { display: none; }
.style-option:hover { border-color: var(--primary-light); transform: translateY(-1px); }
.style-option:active { transform: translateY(0); }
.style-option.selected {
  border-color: var(--primary);
  background: var(--primary-soft);
  box-shadow: 0 2px 8px rgba(107,82,163,0.12);
}
.style-option.selected::after {
  content: '✓';
  position: absolute;
  right: 0.75rem;
  top: 50%;
  transform: translateY(-50%);
  color: white;
  background: var(--primary);
  width: 22px;
  height: 22px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  font-size: 0.75rem;
  font-weight: 700;
}

/* Visual preview swatch */
.style-preview {
  flex-shrink: 0;
  width: 68px;
  height: 52px;
  border-radius: 8px;
  overflow: hidden;
  border: 1px solid rgba(0,0,0,0.08);
  display: flex;
  flex-direction: column;
  padding: 4px 5px;
  gap: 3px;
}
.swatch-row {
  display: flex;
  gap: 2px;
}
.swatch {
  flex: 1;
  height: 12px;
  border-radius: 2px;
}
.preview-text {
  flex: 1;
  display: flex;
  align-items: flex-end;
  padding-bottom: 2px;
}
.preview-heading {
  font-size: 18px;
  font-weight: 700;
  line-height: 1;
}

.style-content { flex: 1; min-width: 0; }
.style-top {
  display: flex;
  align-items: center;
  gap: 0.4rem;
  margin-bottom: 0.2rem;
}
.style-icon { font-size: 1rem; }
.style-label { font-weight: 600; font-size: 0.95rem; }
.style-desc { font-size: 0.82rem; color: var(--text-muted); line-height: 1.35; }

.custom-section { margin-bottom: 1rem; }
.custom-label {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  margin-bottom: 0.5rem;
}
.optional { color: var(--text-muted); font-weight: 400; }
.custom-input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 0.75rem;
  font-size: 0.95rem;
  font-family: inherit;
  resize: vertical;
  outline: none;
}
.custom-input:focus { border-color: var(--primary); box-shadow: 0 0 0 3px var(--primary-soft); }

@media (max-width: 600px) {
  .style-option { padding: 0.6rem; gap: 0.5rem; }
  .style-preview { width: 52px; height: 40px; padding: 3px 4px; }
  .swatch { height: 10px; }
  .preview-heading { font-size: 14px; }
  .style-label { font-size: 0.88rem; }
  .style-desc { font-size: 0.78rem; }
}
</style>

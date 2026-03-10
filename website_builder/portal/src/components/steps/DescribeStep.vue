<template>
  <div class="step">
    <h1>What's your website about?</h1>
    <p class="subtitle">Tell us a bit about your business, hobby, or project. Don't worry about getting it perfect — you can refine later.</p>

    <textarea
      v-model="desc"
      class="big-input"
      placeholder="e.g. My flower arranging business. I make seasonal bouquets for weddings and events in Edinburgh. I've been doing this since 2015."
      rows="5"
      autofocus
    />

    <div class="examples">
      <p class="examples-label">Need inspiration? Try one of these:</p>
      <button
        v-for="ex in examples"
        :key="ex"
        class="example-chip"
        @click="desc = ex"
      >
        {{ ex }}
      </button>
    </div>

    <div class="nav-btns">
      <button
        class="btn-primary"
        :disabled="!desc.trim()"
        @click="$emit('next', desc.trim())"
      >
        Continue →
      </button>
    </div>
  </div>
</template>

<script setup>
import { ref } from 'vue';

const props = defineProps({ description: { type: String, default: '' } });
defineEmits(['next']);

const desc = ref(props.description);

const examples = [
  'My flower arranging business in Edinburgh',
  'My photography portfolio — landscapes and weddings',
  'Our family bakery, specialising in celebration cakes',
  'My consultancy for small business marketing',
];
</script>

<style scoped>
.big-input {
  width: 100%;
  border: 1.5px solid var(--border);
  border-radius: var(--radius);
  padding: 1rem;
  font-size: 1rem;
  font-family: inherit;
  line-height: 1.6;
  resize: vertical;
  outline: none;
  color: var(--text);
  background: var(--surface);
  transition: border-color 0.2s;
}
.big-input:focus { border-color: var(--primary); }

.examples { margin-top: 1.25rem; }
.examples-label { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.6rem; }

.example-chip {
  display: inline-block;
  margin: 0.25rem 0.25rem 0.25rem 0;
  padding: 0.4rem 0.8rem;
  background: var(--bg);
  border: 1px solid var(--border);
  border-radius: 20px;
  font-size: 0.85rem;
  color: var(--primary);
  cursor: pointer;
  transition: background 0.15s, border-color 0.15s;
}
.example-chip:hover {
  background: var(--primary);
  border-color: var(--primary);
  color: white;
}

@media (max-width: 600px) {
  .big-input { padding: 0.75rem; font-size: 0.95rem; rows: 4; }
  .example-chip { font-size: 0.8rem; padding: 0.35rem 0.65rem; }
}
</style>

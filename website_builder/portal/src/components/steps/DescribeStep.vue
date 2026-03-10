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
  'Our village pub — great food, live music, and a sunny garden',
  'Our riding stables in Cornwall — lessons, hacks, and pony parties',
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
  transition: border-color 0.2s, box-shadow 0.2s;
}
.big-input:focus {
  border-color: var(--primary);
  box-shadow: 0 0 0 3px var(--primary-soft);
}

.examples { margin-top: 1.5rem; }
.examples-label { font-size: 0.85rem; color: var(--text-muted); margin-bottom: 0.75rem; }

.example-chip {
  display: inline-block;
  margin: 0.3rem 0.3rem 0.3rem 0;
  padding: 0.5rem 1rem;
  background: var(--surface);
  border: 1.5px solid var(--border);
  border-radius: 24px;
  font-size: 0.9rem;
  color: var(--text);
  cursor: pointer;
  font-family: inherit;
  transition: background 0.2s, border-color 0.2s, color 0.2s, transform 0.1s;
}
.example-chip:hover {
  background: var(--primary-soft);
  border-color: var(--primary-light);
  color: var(--primary);
  transform: translateY(-1px);
}
.example-chip:active {
  transform: translateY(0);
}

@media (max-width: 600px) {
  .big-input { padding: 0.85rem; font-size: 1rem; } /* 16px min prevents iOS zoom */
  .example-chip { font-size: 0.85rem; padding: 0.45rem 0.85rem; }
}
</style>

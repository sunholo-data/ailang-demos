<template>
  <div class="overlay" @click.self="$emit('close')">
    <div class="history-panel">
      <div class="history-header">
        <h2>Version History</h2>
        <span class="history-site-name">{{ siteTitle }}</span>
        <button class="settings-close" @click="$emit('close')">&times;</button>
      </div>
      <div class="history-body">
        <p v-if="loading" class="history-status">Loading history...</p>
        <p v-else-if="error" class="history-status history-error">{{ error }}</p>
        <p v-else-if="commits.length === 0" class="history-status">No version history available.</p>

        <div v-if="commits.length > 0" class="commit-list">
          <div
            v-for="(commit, i) in commits"
            :key="commit.sha"
            class="commit-item"
            :class="{ current: i === 0 }"
          >
            <div class="commit-info">
              <span class="commit-message">{{ commit.message }}</span>
              <span class="commit-meta">
                <code class="commit-sha">{{ commit.shortSha }}</code>
                &middot;
                {{ formatDate(commit.date) }}
                <template v-if="commit.author"> &middot; {{ commit.author }}</template>
              </span>
            </div>
            <div class="commit-actions">
              <span v-if="i === 0" class="current-badge">Current</span>
              <button
                v-else
                class="btn-secondary btn-sm"
                @click="confirmRestore(commit)"
                :disabled="restoring"
              >
                Restore
              </button>
            </div>
          </div>
        </div>

        <!-- Restore confirmation -->
        <div v-if="restoreTarget" class="restore-confirm">
          <p>Restore to version <code>{{ restoreTarget.shortSha }}</code> from {{ formatDate(restoreTarget.date) }}?</p>
          <p class="hint">This creates a new commit with the old files. You can always undo by restoring again.</p>
          <div class="restore-confirm-btns">
            <button class="btn-primary btn-sm" @click="doRestore" :disabled="restoring">
              {{ restoring ? 'Restoring...' : 'Confirm restore' }}
            </button>
            <button class="btn-secondary btn-sm" @click="restoreTarget = null" :disabled="restoring">Cancel</button>
          </div>
          <p v-if="restoreError" class="history-error">{{ restoreError }}</p>
        </div>

        <!-- Success message -->
        <div v-if="restoreSuccess" class="restore-success">
          Restored successfully! Reload your sites list to see the changes.
        </div>
      </div>
    </div>
  </div>
</template>

<script setup>
import { ref, onMounted } from 'vue';
import { getSiteHistory, restoreSiteVersion } from '../api.js';

const props = defineProps({
  userId: { type: String, required: true },
  siteSlug: { type: String, required: true },
  siteTitle: { type: String, default: 'Website' },
});
const emit = defineEmits(['close', 'restored']);

const commits = ref([]);
const loading = ref(true);
const error = ref('');
const restoreTarget = ref(null);
const restoring = ref(false);
const restoreError = ref('');
const restoreSuccess = ref(false);

onMounted(async () => {
  try {
    const data = await getSiteHistory(props.userId, props.siteSlug);
    commits.value = data.commits || [];
  } catch (err) {
    error.value = err.message || 'Failed to load history';
  } finally {
    loading.value = false;
  }
});

function formatDate(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString(undefined, { month: 'short', day: 'numeric', year: 'numeric' })
    + ' ' + d.toLocaleTimeString(undefined, { hour: '2-digit', minute: '2-digit' });
}

function confirmRestore(commit) {
  restoreTarget.value = commit;
  restoreError.value = '';
  restoreSuccess.value = false;
}

async function doRestore() {
  if (!restoreTarget.value) return;
  restoring.value = true;
  restoreError.value = '';
  try {
    await restoreSiteVersion(props.userId, props.siteSlug, restoreTarget.value.sha);
    restoreSuccess.value = true;
    restoreTarget.value = null;
    // Reload history to show the new restore commit
    const data = await getSiteHistory(props.userId, props.siteSlug);
    commits.value = data.commits || [];
    emit('restored');
  } catch (err) {
    restoreError.value = err.message || 'Restore failed';
  } finally {
    restoring.value = false;
  }
}
</script>

<style scoped>
.history-panel {
  background: var(--surface);
  border-radius: var(--radius);
  width: 100%;
  max-width: 520px;
  max-height: 90vh;
  box-shadow: var(--shadow-elevated);
  display: flex;
  flex-direction: column;
}
.history-header {
  display: flex;
  align-items: center;
  gap: 0.75rem;
  padding: 1.25rem 1.5rem 0;
}
.history-header h2 { font-size: 1.1rem; margin: 0; white-space: nowrap; }
.history-site-name {
  flex: 1;
  font-size: 0.85rem;
  color: var(--text-muted);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.history-body {
  padding: 1rem 1.5rem 1.5rem;
  overflow-y: auto;
}
.history-status { color: var(--text-muted); font-size: 0.9rem; }
.history-error { color: #CC0000; font-size: 0.85rem; }

.commit-list {
  display: flex;
  flex-direction: column;
  gap: 0;
}
.commit-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  gap: 0.75rem;
  padding: 0.75rem 0;
  border-bottom: 1px solid var(--border);
}
.commit-item:last-child { border-bottom: none; }
.commit-item.current { opacity: 0.7; }
.commit-info { flex: 1; min-width: 0; }
.commit-message {
  display: block;
  font-size: 0.9rem;
  font-weight: 500;
  color: var(--text);
  white-space: nowrap;
  overflow: hidden;
  text-overflow: ellipsis;
}
.commit-meta {
  display: block;
  font-size: 0.78rem;
  color: var(--text-muted);
  margin-top: 0.2rem;
}
.commit-sha {
  font-size: 0.75rem;
  background: var(--bg);
  padding: 0.1rem 0.35rem;
  border-radius: 4px;
}
.commit-actions {
  flex-shrink: 0;
  display: flex;
  align-items: center;
}
.current-badge {
  font-size: 0.75rem;
  color: var(--text-muted);
  background: var(--bg);
  padding: 0.25rem 0.6rem;
  border-radius: 10px;
  white-space: nowrap;
}

.restore-confirm {
  margin-top: 1rem;
  padding: 1rem;
  background: var(--bg);
  border-radius: var(--radius);
  border: 1px solid var(--border);
}
.restore-confirm p { margin: 0 0 0.5rem; font-size: 0.9rem; }
.restore-confirm .hint { font-size: 0.8rem; color: var(--text-muted); }
.restore-confirm-btns {
  display: flex;
  gap: 0.5rem;
  margin-top: 0.75rem;
}

.restore-success {
  margin-top: 0.75rem;
  padding: 0.75rem 1rem;
  background: #E8F5E9;
  color: #2E7D32;
  border-radius: var(--radius);
  font-size: 0.85rem;
}

.btn-sm {
  padding: 0.45rem 0.85rem;
  font-size: 0.82rem;
  font-family: inherit;
  min-height: 34px;
}

@media (max-width: 600px) {
  .history-panel { max-width: 100%; max-height: 100%; height: 100%; border-radius: 0; }
  .history-header { padding: 1rem 1rem 0; }
  .history-body { padding: 0.75rem 1rem 1.5rem; }
}
</style>

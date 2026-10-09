import { defineStore } from 'pinia'
import { ref } from 'vue'

// Client-only UI state. Anything that comes from the API belongs in vue-query, not here.
export const useUiStore = defineStore('ui', () => {
  const commandPaletteOpen = ref(false)
  /** Nav entries to mark with a dot, by key, with what the dot means (e.g. Settings sections with errors). */
  const navAlerts = ref<Record<string, string>>({})
  return { commandPaletteOpen, navAlerts }
})

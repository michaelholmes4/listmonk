import { defineStore } from 'pinia'
import { ref } from 'vue'

// Client-only UI state. Anything that comes from the API belongs in vue-query, not here.
export const useUiStore = defineStore('ui', () => {
  const commandPaletteOpen = ref(false)
  return { commandPaletteOpen }
})

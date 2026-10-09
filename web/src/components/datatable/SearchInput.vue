<script setup lang="ts">
import { Search, X } from '@lucide/vue'
import { watchDebounced } from '@vueuse/core'
import { ref, watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { InputGroup, InputGroupAddon, InputGroupButton, InputGroupInput } from '@/components/ui/input-group'

/**
 * The toolbar search box. Searches as you type (debounced); Enter searches at once, Escape or the
 * clear button empties it. `v-model` is the committed term, not every keystroke.
 */
const props = withDefaults(defineProps<{ placeholder: string; debounce?: number }>(), { debounce: 300 })
const model = defineModel<string>({ default: '' })
const { t } = useI18n()

const draft = ref(model.value)
watch(model, (v) => v !== draft.value.trim() && (draft.value = v))
const commit = () => {
  const v = draft.value.trim()
  if (v !== model.value) model.value = v
}
watchDebounced(draft, commit, { debounce: props.debounce })
const clear = () => {
  draft.value = ''
  commit()
}
</script>

<template>
  <InputGroup class="w-full sm:max-w-xs" role="search">
    <InputGroupAddon><Search /></InputGroupAddon>
    <InputGroupInput
      v-model="draft"
      type="search"
      :placeholder="placeholder"
      :aria-label="placeholder"
      class="[&::-webkit-search-cancel-button]:hidden"
      @keydown.enter.prevent="commit"
      @keydown.esc="clear"
    />
    <InputGroupAddon v-if="draft" align="inline-end">
      <InputGroupButton size="icon-xs" :aria-label="t('globals.buttons.clear')" @click="clear"><X /></InputGroupButton>
    </InputGroupAddon>
  </InputGroup>
</template>

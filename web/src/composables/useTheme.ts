import { useColorMode } from '@vueuse/core'

/** Light/dark/system. Dark mode is the `.dark` class on <html>, driven by the CSS tokens. */
export function useTheme() {
  return useColorMode({
    selector: 'html',
    attribute: 'class',
    modes: { light: '', dark: 'dark' },
    storageKey: 'librelist-theme',
  })
}

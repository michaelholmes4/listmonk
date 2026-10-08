<script setup lang="ts">
import { useI18n } from 'vue-i18n'

const { t } = useI18n()
const example =
  'email,name,attributes\n' +
  'user1@mail.com,"User One","{""age"": 42, ""planet"": ""Mars""}"\n' +
  'user2@mail.com,"User Two","{""age"": 24, ""job"": ""Time Traveller""}"'
</script>

<template>
  <h2 class="font-medium text-foreground">{{ t('import.instructions') }}</h2>
  <p>{{ t('import.instructionsHelp') }}</p>
  <code class="block rounded-md bg-muted px-2 py-1 text-xs">email, name, attributes</code>
  <h2 class="pt-2 font-medium text-foreground">{{ t('import.csvExample') }}</h2>
  <pre class="overflow-x-auto rounded-md bg-muted p-2 text-xs">{{ example }}</pre>
</template>

<script setup lang="ts">
import { format } from 'date-fns'
import { computed } from 'vue'
import { useI18n } from 'vue-i18n'
import { RouterLink, useRoute } from 'vue-router'
import CopyText from '@/components/CopyText.vue'
import Page from '@/components/layout/Page.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs'
import { useMessage, useMessagePreview } from '@/composables/queries/useMessageLog'
import { usePageTitle } from '@/lib/page-title'

const { t } = useI18n()
const route = useRoute()
const id = computed(() => Number(route.params.id))
const { data: message, isError } = useMessage(id)
const hasContent = computed(() => !!message.value && message.value.content !== 'none')
const preview = useMessagePreview(id, hasContent)

usePageTitle(() => message.value?.subject)

const state = computed(() => (message.value?.status === 'failed' ? 'failed' : message.value?.bounced ? 'bounced' : 'sent'))
const headers = computed(() => Object.entries(message.value?.headers ?? {}))
const when = computed(() => (message.value?.created_at ? format(new Date(message.value.created_at), 'PPpp') : ''))
</script>

<template>
  <Page :title="message?.subject || (isError ? t('web.messages.notFound') : '…')">
    <template v-if="message" #badges>
      <Badge :variant="state === 'failed' ? 'destructive' : state === 'bounced' ? 'warning' : 'success'">{{ t(`web.messages.status.${state}`) }}</Badge>
      <Badge variant="secondary">{{ t(`web.messages.sources.${message.source}`) }}</Badge>
    </template>
    <template v-if="message" #meta>
      <span>{{ t('web.messages.from') }}: {{ message.from }}</span>
      <span>
        {{ t('web.messages.to') }}:
        <RouterLink v-if="message.subscriber_id" :to="{ name: 'subscriber', params: { id: message.subscriber_id } }" class="hover:underline">{{ message.to?.join(', ') }}</RouterLink>
        <template v-else>{{ message.to?.join(', ') }}</template>
      </span>
      <span>{{ when }}</span>
      <RouterLink v-if="message.campaign_id && message.campaign_name" :to="{ name: 'campaign', params: { id: message.campaign_id } }" class="hover:underline">
        {{ message.campaign_name }}
      </RouterLink>
      <RouterLink v-else-if="message.automation_id && message.automation_name" :to="{ name: 'automation', params: { id: message.automation_id } }" class="hover:underline">
        {{ message.automation_name }}
      </RouterLink>
    </template>

    <p v-if="isError" class="text-sm text-muted-foreground">{{ t('web.messages.notFound') }}</p>
    <div v-else-if="!message" class="space-y-4">
      <Skeleton class="h-9 w-64" />
      <Skeleton class="h-96 w-full" />
    </div>
    <Tabs v-else default-value="email">
      <TabsList>
        <TabsTrigger value="email">{{ t('web.messages.email') }}</TabsTrigger>
        <TabsTrigger v-if="message.alt_body" value="text">{{ t('web.messages.plainText') }}</TabsTrigger>
        <TabsTrigger value="details">{{ t('web.common.details') }}</TabsTrigger>
      </TabsList>

      <TabsContent value="email" class="space-y-3">
        <p v-if="message.content === 'none'" class="text-sm text-muted-foreground" data-cy="message-no-content">{{ t('web.messages.noContent') }}</p>
        <template v-else>
          <p v-if="message.content === 'rerender'" class="box bg-muted/40 px-3 py-2 text-sm text-muted-foreground" data-cy="message-rerender-note">
            {{ t('web.messages.rerenderNote') }}
          </p>
          <Skeleton v-if="preview.isPending.value" class="h-[70vh] w-full" />
          <p v-else-if="preview.isError.value" class="text-sm text-muted-foreground">{{ t('web.messages.cannotRender') }}</p>
          <!-- The email may carry scripts of its own; without allow-same-origin they cannot reach the admin session. -->
          <iframe
            v-else
            :srcdoc="preview.data.value ?? ''"
            :title="message.subject"
            sandbox="allow-scripts"
            class="box h-[70vh] w-full bg-white"
            data-cy="message-frame"
          />
        </template>
      </TabsContent>

      <TabsContent v-if="message.alt_body" value="text">
        <pre class="box overflow-auto bg-muted/30 p-3 text-sm whitespace-pre-wrap">{{ message.alt_body }}</pre>
      </TabsContent>

      <TabsContent value="details" class="space-y-6">
        <div v-if="message.status === 'failed'" class="box border-destructive/40 bg-destructive/5 p-3 text-sm" data-cy="message-error">
          <div class="font-medium text-destructive">{{ t('web.messages.error') }}</div>
          <div class="mt-1 break-words">{{ message.error }}</div>
        </div>
        <dl class="grid grid-cols-[auto_1fr] gap-x-6 gap-y-2 text-sm">
          <dt class="text-muted-foreground">{{ t('web.messages.messageId') }}</dt>
          <dd><CopyText :text="message.message_id ?? ''" /></dd>
          <dt class="text-muted-foreground">{{ t('globals.terms.messenger') }}</dt>
          <dd>{{ message.messenger }}</dd>
        </dl>
        <section v-if="message.attachments?.length" class="space-y-2">
          <h3 class="text-sm font-medium">{{ t('web.messages.attachments') }}</h3>
          <ul class="text-sm">
            <li v-for="a in message.attachments" :key="a.name">{{ a.name }} <span class="text-muted-foreground">({{ a.size }} B)</span></li>
          </ul>
        </section>
        <section v-if="headers.length" class="space-y-2">
          <h3 class="text-sm font-medium">{{ t('web.messages.headers') }}</h3>
          <dl class="box grid grid-cols-[auto_1fr] gap-x-6 gap-y-1 overflow-auto bg-muted/30 p-3 font-mono text-xs">
            <template v-for="[name, values] in headers" :key="name">
              <dt class="text-muted-foreground">{{ name }}</dt>
              <dd class="break-all">{{ values.join(', ') }}</dd>
            </template>
          </dl>
        </section>
      </TabsContent>
    </Tabs>
  </Page>
</template>

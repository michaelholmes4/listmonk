<script setup lang="ts">
import { useFormContext } from 'vee-validate'
import { watch } from 'vue'
import { useI18n } from 'vue-i18n'
import { Separator } from '@/components/ui/separator'
import SettingInput from '../fields/SettingInput.vue'
import SettingSelect from '../fields/SettingSelect.vue'
import SettingTags from '../fields/SettingTags.vue'
import type { SettingsForm } from '../schema'

const { t } = useI18n()
const { values, setFieldValue } = useFormContext<SettingsForm>()

// For AWS the endpoint follows the region; a custom (non-AWS) endpoint is left alone.
function followRegion() {
  const url = values.upload?.s3.url ?? ''
  if (url !== '' && !/amazonaws\.com/.test(url)) return
  setFieldValue('upload.s3.url', `https://s3.${values.upload?.s3.aws_default_region ?? ''}.amazonaws.com`)
}
// Only on edits (not on load), so a saved endpoint is never rewritten behind the user's back.
watch(() => [values.upload?.s3.aws_default_region, values.upload?.s3.bucket], followRegion)
</script>

<template>
  <div class="space-y-6">
    <div class="grid items-start gap-6 md:grid-cols-[12rem_1fr]">
      <SettingSelect
        name="upload.provider"
        :label="t('settings.media.provider')"
        :options="[
          { value: 'filesystem', label: 'filesystem' },
          { value: 's3', label: 's3' },
        ]"
      />
      <SettingTags name="upload.extensions" :label="t('settings.media.upload.extensions')" placeholder="jpg, png, gif .." />
    </div>

    <Separator />

    <section v-if="values.upload?.provider === 'filesystem'" class="space-y-6" data-cy="media-filesystem">
      <SettingInput
        name="upload.filesystem.upload_path"
        :label="t('settings.media.upload.path')"
        :help="t('settings.media.upload.pathHelp')"
        placeholder="/home/listmonk/uploads"
        :maxlength="200"
      />
      <SettingInput
        name="upload.filesystem.upload_uri"
        :label="t('settings.media.upload.uri')"
        :help="t('settings.media.upload.uriHelp')"
        placeholder="/uploads"
        :maxlength="200"
      />
    </section>

    <section v-else class="space-y-6" data-cy="media-s3">
      <div class="grid items-start gap-6 md:grid-cols-2">
        <SettingInput name="upload.s3.aws_default_region" :label="t('settings.media.s3.region')" placeholder="ap-south-1" :maxlength="200" />
        <SettingInput name="upload.s3.aws_access_key_id" :label="t('settings.media.s3.key')" :maxlength="200" />
        <SettingInput
          name="upload.s3.aws_secret_access_key"
          type="password"
          autocomplete="new-password"
          :label="t('settings.media.s3.secret')"
          :help="t('globals.messages.passwordChange')"
          :maxlength="200"
        />
        <SettingSelect
          name="upload.s3.bucket_type"
          :label="t('settings.media.s3.bucketType')"
          :options="[
            { value: 'private', label: t('settings.media.s3.bucketTypePrivate') },
            { value: 'public', label: t('settings.media.s3.bucketTypePublic') },
          ]"
        />
        <SettingInput name="upload.s3.bucket" :label="t('settings.media.s3.bucket')" :maxlength="200" />
        <SettingInput
          name="upload.s3.bucket_path"
          :label="t('settings.media.s3.bucketPath')"
          :help="t('settings.media.s3.bucketPathHelp')"
          placeholder="/"
          :maxlength="200"
        />
        <SettingInput
          name="upload.s3.expiry"
          :label="t('settings.media.s3.uploadExpiry')"
          :help="t('settings.media.s3.uploadExpiryHelp')"
          placeholder="14d"
          :maxlength="10"
        />
      </div>
      <SettingInput
        name="upload.s3.url"
        type="url"
        :label="t('settings.media.s3.url')"
        :help="t('settings.media.s3.urlHelp')"
        placeholder="https://s3.$region.amazonaws.com"
        :maxlength="200"
      />
      <SettingInput
        name="upload.s3.public_url"
        :label="t('settings.media.s3.publicURL')"
        :help="t('settings.media.s3.publicURLHelp')"
        placeholder="https://files.yourdomain.com"
        :maxlength="200"
      />
    </section>
  </div>
</template>

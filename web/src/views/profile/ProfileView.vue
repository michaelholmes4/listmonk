<script setup lang="ts">
import Page from '@/components/layout/Page.vue'
import { Badge } from '@/components/ui/badge'
import { Skeleton } from '@/components/ui/skeleton'
import { useProfile } from '@/composables/queries/useProfile'
import ProfileForm from '@/features/profile/ProfileForm.vue'
import TwoFactor from '@/features/profile/TwoFactor.vue'

const { data: user } = useProfile()
</script>

<template>
  <Page width="form" :title="user ? `@${user.username}` : '…'">
    <template v-if="user?.user_role" #badges>
      <Badge variant="secondary">{{ user.user_role.name }}</Badge>
    </template>

    <div v-if="!user" class="space-y-4">
      <Skeleton class="h-9 w-full" />
      <Skeleton class="h-9 w-full" />
    </div>
    <div v-else class="space-y-8">
      <ProfileForm :user="user" />
      <TwoFactor v-if="user.password_login" :user="user" />
    </div>
  </Page>
</template>

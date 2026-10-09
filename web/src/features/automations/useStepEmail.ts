import { computed, ref, toValue, watch, type MaybeRefOrGetter } from 'vue'
import { useUpdateStepEmail } from '@/composables/queries/useAutomations'
import { useCampaign } from '@/composables/queries/useCampaigns'
import type { ContentType } from '@/features/campaigns/schema'
import { toForm, toRequest } from '@/features/campaigns/schema'

/**
 * The content of an email step: the hidden campaign behind it, as an editable copy. The copy is
 * loaded once per campaign (a refetch must not overwrite what is being typed); `dirty` is whether it
 * differs from the saved campaign. Saving sends the content only: the step's topic is the
 * automation's business, so no lists go along.
 */
export function useStepEmail(campaignId: MaybeRefOrGetter<number | undefined>) {
  const { data: campaign, isPending: loading, isFetching } = useCampaign(campaignId)
  const subject = ref('')
  const fromEmail = ref('')
  const contentType = ref<ContentType>('richtext')
  const body = ref('')
  const bodySource = ref<string | null>(null)
  const templateId = ref<number | null>(null)
  const loadedFor = ref<number>()

  function reset() {
    const c = campaign.value
    if (!c) return
    const f = toForm(c)
    subject.value = f.subject
    fromEmail.value = f.fromEmail
    contentType.value = f.contentType
    body.value = f.body
    bodySource.value = f.bodySource
    templateId.value = f.templateId
    loadedFor.value = c.id
  }
  watch(
    [campaign, isFetching],
    // Not while a refetch of a cached copy is under way: that copy may be stale.
    () => campaign.value && !isFetching.value && loadedFor.value !== campaign.value.id && reset(),
    { immediate: true },
  )

  const ready = computed(() => !!campaign.value && loadedFor.value === campaign.value.id)
  const dirty = computed(() => {
    const c = campaign.value
    if (!c || !ready.value) return false
    const f = toForm(c)
    return subject.value !== f.subject || fromEmail.value !== f.fromEmail || contentType.value !== f.contentType || body.value !== f.body || templateId.value !== f.templateId
  })

  const update = useUpdateStepEmail()
  async function save() {
    const c = campaign.value!
    const f = { ...toForm(c), subject: subject.value, fromEmail: fromEmail.value, contentType: contentType.value, body: body.value, bodySource: bodySource.value, templateId: templateId.value }
    const { lists: _lists, ...req } = toRequest(f)
    await update.mutateAsync({ id: c.id!, body: req })
  }

  return {
    campaign,
    loading: computed(() => toValue(campaignId) !== undefined && (loading.value || !ready.value)),
    ready,
    subject,
    fromEmail,
    contentType,
    body,
    bodySource,
    templateId,
    dirty,
    saving: update.isPending,
    save,
    reset,
  }
}

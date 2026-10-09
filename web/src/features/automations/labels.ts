import {
  CalendarClock,
  CircleStop,
  GitBranch,
  Hourglass,
  ListMinus,
  ListPlus,
  Mail,
  PencilLine,
  Timer,
  UserPlus,
  Variable,
  Zap,
} from '@lucide/vue'
import type { Component } from 'vue'
import type { StepType, TriggerType } from './model'

/** How each kind of step is presented: its icon and i18n keys (title and one-line help). */
export const stepMeta: Record<StepType, { icon: Component; title: string; help: string }> = {
  send_email: { icon: Mail, title: 'web.automations.step.send_email', help: 'web.automations.step.send_email_help' },
  delay: { icon: Hourglass, title: 'web.automations.step.delay', help: 'web.automations.step.delay_help' },
  wait_until: { icon: CalendarClock, title: 'web.automations.step.wait_until', help: 'web.automations.step.wait_until_help' },
  wait_for_event: { icon: Timer, title: 'web.automations.step.wait_for_event', help: 'web.automations.step.wait_for_event_help' },
  condition: { icon: GitBranch, title: 'web.automations.step.condition', help: 'web.automations.step.condition_help' },
  update_attribute: { icon: PencilLine, title: 'web.automations.step.update_attribute', help: 'web.automations.step.update_attribute_help' },
  add_to_list: { icon: ListPlus, title: 'web.automations.step.add_to_list', help: 'web.automations.step.add_to_list_help' },
  remove_from_list: { icon: ListMinus, title: 'web.automations.step.remove_from_list', help: 'web.automations.step.remove_from_list_help' },
  exit: { icon: CircleStop, title: 'web.automations.step.exit', help: 'web.automations.step.exit_help' },
}

export const triggerMeta: Record<TriggerType, { icon: Component; title: string; help: string }> = {
  list_joined: { icon: UserPlus, title: 'web.automations.trigger.list_joined', help: 'web.automations.trigger.list_joined_help' },
  attribute_changed: { icon: Variable, title: 'web.automations.trigger.attribute_changed', help: 'web.automations.trigger.attribute_changed_help' },
  event: { icon: Zap, title: 'web.automations.trigger.event', help: 'web.automations.trigger.event_help' },
  manual: { icon: UserPlus, title: 'web.automations.trigger.manual', help: 'web.automations.trigger.manual_help' },
}

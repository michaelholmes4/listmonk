import {
  CalendarClock,
  CircleStop,
  CornerDownRight,
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
import { branchHandles, waitEvents, type Flow, type Step, type StepType, type TriggerType } from './model'

/** How each kind of step is presented: its icon and i18n keys (title and one-line help). */
export const stepMeta: Record<StepType, { icon: Component; title: string; help: string }> = {
  send_email: { icon: Mail, title: 'web.automations.step.send_email', help: 'web.automations.step.send_email_help' },
  delay: { icon: Hourglass, title: 'web.automations.step.delay', help: 'web.automations.step.delay_help' },
  wait_until: { icon: CalendarClock, title: 'web.automations.step.wait_until', help: 'web.automations.step.wait_until_help' },
  wait_for_event: { icon: Timer, title: 'web.automations.step.wait_for_event', help: 'web.automations.step.wait_for_event_help' },
  condition: { icon: GitBranch, title: 'web.automations.step.condition', help: 'web.automations.step.condition_help' },
  go_to: { icon: CornerDownRight, title: 'web.automations.step.go_to', help: 'web.automations.step.go_to_help' },
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

type T = (key: string, params?: Record<string, unknown>) => string

/** The heading of one path out of a branching step: "Yes", an event's name, "Time's up". */
export function branchTitle(t: T, s: Step, h: string): string {
  if (s.type === 'wait_for_event' && h !== 'timeout') return waitEvents(s.config).find((e) => e.id === h)?.name || t('web.automations.waitForEvent.unnamed')
  return t(`web.automations.branch.${h}`)
}

/** Where each step sits: the headings of the paths leading to it ("" for the main run). */
export function stepPaths(t: T, f: Flow): Map<string, string> {
  const out = new Map<string, string>()
  const walk = (list: Step[], path: string[]) => {
    for (const s of list) {
      out.set(s.id, path.join(' › '))
      for (const h of branchHandles(s)) walk(s.branches?.[h] ?? [], [...path, branchTitle(t, s, h)])
    }
  }
  walk(f.steps, [])
  return out
}

import { Plus } from 'lucide-react'
import { LIMITS } from '../lib/household'
import { addMember, addRoom, removeMember, updateMember } from '../lib/householdEdits'
import type { Household } from '../types'
import { MemberCard } from './MemberCard'
import { Button, Card, H2 } from './ui'

/** Edit the people and rooms of a household; every change applies to the plan immediately. */
export function HouseholdEditor({
  household,
  onChange,
  onReset,
}: {
  household: Household
  onChange: (h: Household) => void
  onReset: () => void
}) {
  return (
    <Card labelledBy="household">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <H2 id="household">Your household</H2>
        <Button variant="ghost" onClick={onReset}>
          Start over
        </Button>
      </div>
      <p className="mt-1 text-sm text-muted">Changes apply instantly to the plan. Saved in this browser only.</p>
      <div className="mt-3 space-y-3">
        {household.members.map((m) => (
          <MemberCard
            key={m.id}
            m={m}
            canRemove={household.members.length > 1}
            onChange={(next) => onChange(updateMember(household, next))}
            onRemove={() => onChange(removeMember(household, m.id))}
          />
        ))}
      </div>
      <div className="mt-3 flex flex-wrap gap-2">
        {household.members.length < LIMITS.members && (
          <Button variant="ghost" onClick={() => onChange(addMember(household))}>
            <span className="inline-flex items-center gap-1">
              <Plus size={14} aria-hidden /> Add person
            </span>
          </Button>
        )}
        {household.home.rooms.length < LIMITS.rooms && (
          <Button variant="ghost" onClick={() => onChange(addRoom(household))}>
            <span className="inline-flex items-center gap-1">
              <Plus size={14} aria-hidden /> Add room
            </span>
          </Button>
        )}
      </div>
    </Card>
  )
}

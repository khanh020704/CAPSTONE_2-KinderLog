import { Ban, CheckCircle2, KeyRound, Lock } from 'lucide-react'
import { INITIAL_PASSWORD } from '../store/store'
import { STATUS } from './labels'

// Activate / Deactivate / Lock menu entries shared by every account-like list.
// `save(status)` calls the backend; `done()` reloads the list afterwards.
export function statusActions({ row, name = row.fullName || row.name, noun, save, done, toast, lock = true }) {
  const set = (status, past) => async () => {
    await save(status)
    toast(`${name} has been ${past}.`)
    done?.()
  }
  const status = STATUS[row.status] || row.status
  return [
    status !== 'Active' && { label: 'Activate', icon: CheckCircle2, onClick: set('ACTIVE', 'activated') },
    status === 'Active' && {
      label: 'Deactivate',
      icon: Ban,
      onClick: set('INACTIVE', 'deactivated'),
      confirm: { title: `Deactivate ${name}?`, body: `This ${noun.toLowerCase()} will no longer be available until it is activated again.` },
    },
    lock &&
      status !== 'Locked' && {
        label: 'Lock',
        icon: Lock,
        danger: true,
        onClick: set('LOCKED', 'locked'),
        confirm: { title: `Lock ${name}?`, body: `Access will be blocked immediately. You can activate this ${noun.toLowerCase()} again later.` },
      },
  ]
}

// For someone who forgot their password: their manager sets it back to the initial one on the backend.
export function resetPasswordAction({ row, reset, toast }) {
  const name = row.fullName || row.name
  return {
    label: 'Reset Password',
    icon: KeyRound,
    confirm: {
      title: `Reset the password of ${name}?`,
      body: `The password goes back to the initial one (${INITIAL_PASSWORD}). Ask them to change it after signing in.`,
      confirmLabel: 'Reset',
    },
    onClick: async () => {
      await reset()
      toast(`Password reset. ${name} can sign in with ${INITIAL_PASSWORD}.`)
    },
  }
}

import { Ban, CheckCircle2, KeyRound, Lock } from 'lucide-react'
import { DEMO_PASSWORD } from '../store/store'

// Activate / Deactivate / Lock menu entries shared by every account-like list.
export function statusActions({ row, coll, noun, module, upsert, log, toast, lock = true }) {
  const set = (status, action, past) => () => {
    upsert(coll, { id: row.id, status })
    log(action, module, `${noun} ${past}: ${row.name}`)
    toast(`${row.name} has been ${past}.`)
  }
  return [
    row.status !== 'Active' && { label: 'Activate', icon: CheckCircle2, onClick: set('Active', 'Activate', 'activated') },
    row.status === 'Active' && {
      label: 'Deactivate',
      icon: Ban,
      onClick: set('Inactive', 'Deactivate', 'deactivated'),
      confirm: { title: `Deactivate ${row.name}?`, body: `This ${noun.toLowerCase()} will no longer be available until it is activated again.` },
    },
    lock &&
      row.status !== 'Locked' && {
        label: 'Lock',
        icon: Lock,
        danger: true,
        onClick: set('Locked', 'Lock', 'locked'),
        confirm: { title: `Lock ${row.name}?`, body: `Access will be blocked immediately. You can activate this ${noun.toLowerCase()} again later.` },
      },
  ]
}

// For someone who forgot their password and cannot use the email reset: their manager sets it back to the initial one.
export function resetPasswordAction({ row, noun, module, mutate, log, toast }) {
  return {
    label: 'Reset Password',
    icon: KeyRound,
    confirm: {
      title: `Reset the password of ${row.name}?`,
      body: `The password goes back to the initial one (${DEMO_PASSWORD}). Ask them to change it after signing in.`,
      confirmLabel: 'Reset',
    },
    onClick: () => {
      mutate((prev) => {
        const passwords = { ...prev.passwords }
        delete passwords[row.id]
        return { passwords }
      })
      log('Update', module, `${noun} password reset: ${row.name}`)
      toast(`Password reset. ${row.name} can sign in with ${DEMO_PASSWORD}.`)
    },
  }
}

export const phoneTaken =(db, phone, id) =>
  ['admins', 'principals', 'teachers', 'parents'].some((c) => db[c].some((u) => u.phone === phone.trim() && u.id !== id))

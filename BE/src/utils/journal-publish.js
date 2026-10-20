// What changed between two published versions of a journal, so that a published change is announced only
// to the parents it concerns. Versions have the API shape: { sections, personal: { studentId: text }, photos }.

const same = (a, b) => JSON.stringify(a) === JSON.stringify(b)

// classChanged: a class section or the photos changed, which every parent of the class sees.
// studentIds: children whose own note was added, changed or removed, which only their parents see.
export function publishedChanges(before, after) {
  const classChanged = !same(before.sections, after.sections) || !same(before.photos, after.photos)
  const students = new Set([...Object.keys(before.personal), ...Object.keys(after.personal)])
  const studentIds = [...students].filter((id) => (before.personal[id] || '') !== (after.personal[id] || '')).sort()
  return { classChanged, studentIds }
}

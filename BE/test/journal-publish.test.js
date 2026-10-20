import { test } from 'node:test'
import assert from 'node:assert/strict'
import { publishedChanges } from '../src/utils/journal-publish.js'

const sections = (over = {}) => ({ meal: 'Ăn hết suất.', learning: 'Học đếm số.', sleep: '', health: '', emotion: '', note: '', ...over })
const version = (over = {}) => ({ sections: sections(), personal: { an: 'An hơi ho.', ngoc: 'Ngọc ngoan.' }, photos: ['a.jpg'], ...over })

test('nothing changed: nobody is told', () => {
  assert.deepEqual(publishedChanges(version(), version()), { classChanged: false, studentIds: [] })
})

test('a class section changed: the whole class, no child in particular', () => {
  assert.deepEqual(publishedChanges(version(), version({ sections: sections({ sleep: 'Ngủ ngon.' }) })), { classChanged: true, studentIds: [] })
})

test('the photos changed: the whole class', () => {
  assert.equal(publishedChanges(version(), version({ photos: ['a.jpg', 'b.jpg'] })).classChanged, true)
  assert.equal(publishedChanges(version(), version({ photos: [] })).classChanged, true)
})

test("one child's note changed: only that child", () => {
  const after = version({ personal: { an: 'An đã đỡ ho.', ngoc: 'Ngọc ngoan.' } })
  assert.deepEqual(publishedChanges(version(), after), { classChanged: false, studentIds: ['an'] })
})

test('a note added or removed concerns that child', () => {
  assert.deepEqual(publishedChanges(version(), version({ personal: { an: 'An hơi ho.', ngoc: 'Ngọc ngoan.', huy: 'Huy ngủ ngon.' } })).studentIds, ['huy'])
  assert.deepEqual(publishedChanges(version(), version({ personal: { ngoc: 'Ngọc ngoan.' } })).studentIds, ['an'])
})

test('class and notes changed together are both reported', () => {
  const after = version({ sections: sections({ meal: 'Ăn ít.' }), personal: { an: 'An hơi ho.', ngoc: 'Ngọc hôm nay mệt.' } })
  assert.deepEqual(publishedChanges(version(), after), { classChanged: true, studentIds: ['ngoc'] })
})

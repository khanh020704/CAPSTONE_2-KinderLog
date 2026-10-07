import { useMemo, useState } from 'react'
import { AlertCircle, ArrowDown, ArrowUp, Eye, ImagePlus, Pencil, Plus } from 'lucide-react'
import { isEmail, isPhone, norm, readFileAsDataURL } from '../lib/utils'
import {
  Avatar,
  Combobox,
  ConfirmDialog,
  EmptyState,
  Field,
  Modal,
  PageHeader,
  Pagination,
  RowMenu,
  SearchInput,
  Select,
  SkeletonTable,
  useFakeLoad,
  useToast,
} from './ui'

export function validateFields(fields, form) {
  const errors = {}
  for (const f of fields) {
    const v = form[f.name]
    const blank = v === undefined || v === null || String(v).trim() === ''
    if (f.required && blank) errors[f.name] = `${f.label} is required.`
    else if (!blank && f.type === 'tel' && !isPhone(v)) errors[f.name] = 'Enter a 10-digit phone number starting with 0.'
    else if (!blank && f.type === 'email' && !isEmail(v)) errors[f.name] = 'Enter a valid email address.'
    else if (f.validate) {
      const msg = f.validate(v, form)
      if (msg) errors[f.name] = msg
    }
  }
  return errors
}

export function FormFields({ fields, form, setForm, errors = {} }) {
  const set = (name, value) => setForm((p) => ({ ...p, [name]: value }))
  return (
    <div className="form-grid">
      {fields.map((f) => {
        const common = { value: form[f.name] ?? '', onChange: (e) => set(f.name, e.target.value), placeholder: f.placeholder }
        let control
        if (f.type === 'select') control = <Select value={form[f.name] ?? ''} onChange={(v) => set(f.name, v)} options={f.options} placeholder={'placeholder' in f ? f.placeholder : 'Select…'} />
        else if (f.type === 'combobox') control = <Combobox options={f.options} value={form[f.name] ?? ''} onChange={(v) => set(f.name, v)} placeholder={f.placeholder} />
        else if (f.type === 'textarea') control = <textarea rows={f.rows || 4} {...common} />
        else if (f.type === 'photo')
          control = (
            <div className="photo-field">
              <Avatar name={form.name || '?'} src={form[f.name]} size={56} />
              <label className="btn btn-sm">
                <ImagePlus size={16} /> {form[f.name] ? 'Change photo' : 'Upload photo'}
                <input
                  type="file"
                  accept="image/*"
                  hidden
                  onChange={async (e) => e.target.files[0] && set(f.name, await readFileAsDataURL(e.target.files[0]))}
                />
              </label>
            </div>
          )
        else control = <input type={f.type || 'text'} inputMode={f.type === 'tel' ? 'numeric' : undefined} {...common} />
        return (
          <Field key={f.name} label={f.label} required={f.required} error={errors[f.name]} hint={f.hint} full={f.full || f.type === 'textarea'}>
            {control}
          </Field>
        )
      })}
    </div>
  )
}

export default function CrudPage({
  title,
  subtitle,
  noun,
  addLabel,
  rows,
  columns,
  searchText,
  searchPlaceholder,
  filters = [],
  fields,
  initial,
  onSave,
  actions,
  viewRows,
  canEdit = true,
  empty,
  pageSize = 8,
  headerExtra,
  saveLabel,
  submitOptions, // [{ label, primary, patch }]: several submit buttons, each merging its patch into the form
}) {
  const toast = useToast()
  const loading = useFakeLoad()
  const [q, setQ] = useState('')
  const [filterVals, setFilterVals] = useState({})
  const [sort, setSort] = useState(null)
  const [page, setPage] = useState(1)
  const [editing, setEditing] = useState(undefined) // undefined = closed, null = new
  const [form, setForm] = useState({})
  const [errors, setErrors] = useState({})
  const [formError, setFormError] = useState('')
  const [saving, setSaving] = useState(false)
  const [viewing, setViewing] = useState(null)
  const [confirm, setConfirm] = useState(null)

  const filtered = useMemo(() => {
    const nq = norm(q)
    let out = rows.filter((r) => (!nq || norm(searchText(r)).includes(nq)) && filters.every((f) => !filterVals[f.key] || f.get(r) === filterVals[f.key]))
    if (sort) {
      const col = columns.find((c) => c.key === sort.key)
      out = [...out].sort((a, b) => {
        const va = col.sort(a)
        const vb = col.sort(b)
        return (typeof va === 'number' ? va - vb : String(va).localeCompare(String(vb), 'vi')) * (sort.dir === 'asc' ? 1 : -1)
      })
    }
    return out
  }, [rows, q, filterVals, sort, columns, filters, searchText])

  const pages = Math.max(1, Math.ceil(filtered.length / pageSize))
  const cur = Math.min(page, pages)
  const pageRows = filtered.slice((cur - 1) * pageSize, cur * pageSize)
  const activeFields = editing !== undefined && fields ? (typeof fields === 'function' ? fields(form, editing) : fields) : []

  const openForm = (row) => {
    setForm(initial(row))
    setErrors({})
    setFormError('')
    setEditing(row)
  }

  const submit = (e, patch) => {
    e?.preventDefault()
    const data = patch ? { ...form, ...patch } : form
    const errs = validateFields(activeFields, data)
    setErrors(errs)
    setFormError('')
    if (Object.keys(errs).length) return
    setSaving(true)
    setTimeout(() => {
      setSaving(false)
      const err = onSave(data, editing)
      if (err) return setFormError(err)
      toast(editing ? `${noun} updated successfully.` : `${noun} created successfully.`)
      setEditing(undefined)
    }, 500)
  }

  const runAction = (item) => (item.confirm ? setConfirm(item) : item.onClick())

  const menuFor = (row) => [
    viewRows && { label: 'View', icon: Eye, onClick: () => setViewing(row) },
    canEdit && fields && { label: 'Edit', icon: Pencil, onClick: () => openForm(row) },
    ...(actions ? actions(row).filter(Boolean).map((a) => ({ ...a, onClick: () => runAction(a) })) : []),
  ]

  return (
    <>
      <PageHeader
        title={title}
        subtitle={subtitle}
        actions={
          <>
            {headerExtra}
            {addLabel && (
              <button className="btn btn-primary" onClick={() => openForm(null)}>
                <Plus size={18} /> {addLabel}
              </button>
            )}
          </>
        }
      />

      <div className="toolbar">
        <SearchInput
          value={q}
          onChange={(v) => {
            setQ(v)
            setPage(1)
          }}
          placeholder={searchPlaceholder || `Search ${title.toLowerCase()}`}
        />
        {filters.map((f) => (
          <Select
            key={f.key}
            value={filterVals[f.key] || ''}
            onChange={(v) => {
              setFilterVals((p) => ({ ...p, [f.key]: v }))
              setPage(1)
            }}
            options={f.options}
            placeholder={`All ${f.label}`}
            aria-label={f.label}
          />
        ))}
      </div>

      {loading ? (
        <SkeletonTable />
      ) : filtered.length === 0 ? (
        <div className="card">
          <EmptyState {...(rows.length === 0 ? empty : { title: 'No results found.', text: 'Try a different search or filter.' })} />
        </div>
      ) : (
        <div className="card table-card">
          <table className="table">
            <thead>
              <tr>
                {columns.map((c) => (
                  <th key={c.key}>
                    {c.sort ? (
                      <button
                        className="th-sort"
                        onClick={() => setSort((s) => (s?.key === c.key ? (s.dir === 'asc' ? { key: c.key, dir: 'desc' } : null) : { key: c.key, dir: 'asc' }))}
                      >
                        {c.label}
                        {sort?.key === c.key && (sort.dir === 'asc' ? <ArrowUp size={14} /> : <ArrowDown size={14} />)}
                      </button>
                    ) : (
                      c.label
                    )}
                  </th>
                ))}
                <th className="th-actions">Actions</th>
              </tr>
            </thead>
            <tbody>
              {pageRows.map((row) => (
                <tr key={row.id}>
                  {columns.map((c, i) => (
                    <td key={c.key} data-label={c.label} className={i === 0 ? 'td-primary' : ''}>
                      {c.render ? c.render(row) : row[c.key] || '—'}
                    </td>
                  ))}
                  <td className="td-actions">
                    <RowMenu items={menuFor(row)} />
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          <Pagination page={cur} pages={pages} total={filtered.length} onPage={setPage} />
        </div>
      )}

      <Modal open={editing !== undefined} title={editing ? `Edit ${noun}` : addLabel || `Add ${noun}`} onClose={() => !saving && setEditing(undefined)}>
        <form onSubmit={submit} noValidate>
          {formError && (
            <div className="alert alert-error">
              <AlertCircle size={18} /> {formError}
            </div>
          )}
          <FormFields fields={activeFields} form={form} setForm={setForm} errors={errors} />
          <div className="form-actions">
            <button type="button" className="btn" onClick={() => setEditing(undefined)} disabled={saving}>
              Cancel
            </button>
            {submitOptions ? (
              submitOptions.map((o) => (
                <button key={o.label} type="button" className={`btn ${o.primary ? 'btn-primary' : ''}`} disabled={saving} onClick={() => submit(null, o.patch)}>
                  {o.label}
                </button>
              ))
            ) : (
              <button type="submit" className="btn btn-primary" disabled={saving}>
                {saving ? 'Saving…' : saveLabel || (editing ? 'Save Changes' : 'Save')}
              </button>
            )}
          </div>
        </form>
      </Modal>

      <Modal
        open={!!viewing}
        title={`${noun} Details`}
        onClose={() => setViewing(null)}
        footer={
          <>
            <button className="btn" onClick={() => setViewing(null)}>
              Close
            </button>
            {canEdit && fields && (
              <button
                className="btn btn-primary"
                onClick={() => {
                  const row = viewing
                  setViewing(null)
                  openForm(row)
                }}
              >
                <Pencil size={16} /> Edit
              </button>
            )}
          </>
        }
      >
        {viewing && (
          <dl className="details">
            {viewRows(viewing).map(([k, v]) => (
              <div key={k}>
                <dt>{k}</dt>
                <dd>{v || '—'}</dd>
              </div>
            ))}
          </dl>
        )}
      </Modal>

      <ConfirmDialog
        open={!!confirm}
        title={confirm?.confirm.title}
        body={confirm?.confirm.body}
        confirmLabel={confirm?.confirm.confirmLabel || confirm?.label}
        danger={confirm?.danger}
        onClose={() => setConfirm(null)}
        onConfirm={() => {
          confirm.onClick()
          setConfirm(null)
        }}
      />
    </>
  )
}

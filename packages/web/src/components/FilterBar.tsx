import { useState, useEffect, useRef, useMemo } from 'react'
import { Search, X, ChevronDown } from 'lucide-react'
import type { Ticket, TicketStatus, TicketPriority } from '../types'

const STATUS_OPTIONS: { value: TicketStatus; label: string }[] = [
  { value: 'todo', label: 'Todo' },
  { value: 'in_progress', label: 'In Progress' },
  { value: 'in_review', label: 'In Review' },
  { value: 'done', label: 'Done' },
]

const PRIORITY_OPTIONS: { value: TicketPriority; label: string }[] = [
  { value: 'high', label: 'High' },
  { value: 'medium', label: 'Medium' },
  { value: 'low', label: 'Low' },
]

export interface FilterState {
  search: string
  statuses: TicketStatus[]
  priorities: TicketPriority[]
  assignee: string | null
}

export const EMPTY_FILTERS: FilterState = {
  search: '',
  statuses: [],
  priorities: [],
  assignee: null,
}

export function isFiltering(f: FilterState): boolean {
  return f.search !== '' || f.statuses.length > 0 || f.priorities.length > 0 || f.assignee !== null
}

export function applyFilters(tickets: Ticket[], filters: FilterState): Ticket[] {
  let result = tickets

  if (filters.search) {
    const q = filters.search.toLowerCase()
    result = result.filter(
      (t) =>
        t.id.toLowerCase().includes(q) ||
        t.title.toLowerCase().includes(q) ||
        t.labels.some((l) => l.toLowerCase().includes(q))
    )
  }

  if (filters.statuses.length > 0) {
    result = result.filter((t) => filters.statuses.includes(t.status))
  }

  if (filters.priorities.length > 0) {
    result = result.filter((t) => filters.priorities.includes(t.priority))
  }

  if (filters.assignee !== null) {
    result = result.filter((t) => t.assignee === filters.assignee)
  }

  return result
}

export function FilterBar({
  tickets,
  filters,
  onChange,
  onClear,
}: {
  tickets: Ticket[]
  filters: FilterState
  onChange: (filters: FilterState) => void
  onClear: () => void
}) {
  const [searchInput, setSearchInput] = useState(filters.search)
  const debounceRef = useRef<ReturnType<typeof setTimeout> | undefined>(undefined)

  useEffect(() => {
    if (debounceRef.current !== undefined) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => {
      onChange({ ...filters, search: searchInput })
    }, 200) as ReturnType<typeof setTimeout>
    return () => clearTimeout(debounceRef.current)
  }, [searchInput])

  // Sync if filters are cleared externally
  useEffect(() => {
    if (filters.search === '' && searchInput !== '') setSearchInput('')
  }, [filters.search])

  const uniqueAssignees = useMemo(() => {
    const set = new Set<string>()
    for (const t of tickets) {
      if (t.assignee) set.add(t.assignee)
    }
    return [...set].sort()
  }, [tickets])

  return (
    <div style={styles.bar}>
      {/* Search */}
      <div style={styles.searchWrapper}>
        <Search size={14} color="var(--color-on-surface-variant)" />
        <input
          id="filter-search"
          type="text"
          placeholder="Search tasks…"
          value={searchInput}
          onChange={(e) => setSearchInput(e.target.value)}
          style={styles.searchInput}
        />
        {searchInput && (
          <button onClick={() => setSearchInput('')} style={styles.clearIcon}>
            <X size={12} />
          </button>
        )}
      </div>

      {/* Clear all filters — next to search */}
      {isFiltering(filters) && (
        <button onClick={onClear} style={styles.clearBtn}>
          <X size={12} />
          Clear
        </button>
      )}

      {/* Status multi-select */}
      <MultiSelect
        id="filter-status"
        label="Status"
        options={STATUS_OPTIONS}
        selected={filters.statuses}
        onChange={(statuses) => onChange({ ...filters, statuses: statuses as TicketStatus[] })}
      />

      {/* Priority multi-select */}
      <MultiSelect
        id="filter-priority"
        label="Priority"
        options={PRIORITY_OPTIONS}
        selected={filters.priorities}
        onChange={(priorities) => onChange({ ...filters, priorities: priorities as TicketPriority[] })}
      />

      {/* Assignee dropdown */}
      {uniqueAssignees.length > 0 && (
        <div style={{ position: 'relative' }}>
          <DropdownSelect
            id="filter-assignee"
            label="Assignee"
            options={[{ value: '', label: 'All' }, ...uniqueAssignees.map((a) => ({ value: a, label: a }))]}
            value={filters.assignee ?? ''}
            onChange={(v) => onChange({ ...filters, assignee: v || null })}
          />
        </div>
      )}
    </div>
  )
}

// ─── Multi-select dropdown ───────────────────────────────────────────────────

function MultiSelect({
  id,
  label,
  options,
  selected,
  onChange,
}: {
  id: string
  label: string
  options: { value: string; label: string }[]
  selected: string[]
  onChange: (selected: string[]) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  function toggle(value: string) {
    if (selected.includes(value)) onChange(selected.filter((v) => v !== value))
    else onChange([...selected, value])
  }

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        id={id}
        onClick={() => setOpen(!open)}
        style={{
          ...styles.dropdownBtn,
          ...(selected.length > 0 ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}),
        }}
      >
        {label}
        {selected.length > 0 && (
          <span style={styles.filterCount}>{selected.length}</span>
        )}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div style={styles.dropdownMenu}>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => toggle(opt.value)}
              style={{
                ...styles.dropdownItem,
                ...(selected.includes(opt.value) ? { background: 'rgba(0, 104, 95, 0.06)', color: 'var(--color-primary)', fontWeight: '600' } : {}),
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Single-select dropdown ──────────────────────────────────────────────────

function DropdownSelect({
  id,
  label,
  options,
  value,
  onChange,
}: {
  id: string
  label: string
  options: { value: string; label: string }[]
  value: string
  onChange: (value: string) => void
}) {
  const [open, setOpen] = useState(false)
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    function handleClick(e: MouseEvent) {
      if (ref.current && !ref.current.contains(e.target as Node)) setOpen(false)
    }
    document.addEventListener('mousedown', handleClick)
    return () => document.removeEventListener('mousedown', handleClick)
  }, [])

  const selectedLabel = options.find((o) => o.value === value)?.label ?? label

  return (
    <div ref={ref} style={{ position: 'relative' }}>
      <button
        id={id}
        onClick={() => setOpen(!open)}
        style={{
          ...styles.dropdownBtn,
          ...(value ? { borderColor: 'var(--color-primary)', color: 'var(--color-primary)' } : {}),
        }}
      >
        {value ? selectedLabel : label}
        <ChevronDown size={12} />
      </button>
      {open && (
        <div style={styles.dropdownMenu}>
          {options.map((opt) => (
            <button
              key={opt.value}
              onClick={() => { onChange(opt.value); setOpen(false) }}
              style={{
                ...styles.dropdownItem,
                ...(value === opt.value ? { background: 'rgba(0, 104, 95, 0.06)', color: 'var(--color-primary)', fontWeight: '600' } : {}),
              }}
            >
              {opt.label}
            </button>
          ))}
        </div>
      )}
    </div>
  )
}

// ─── Styles ──────────────────────────────────────────────────────────────────

const styles = {
  bar: {
    display: 'flex',
    alignItems: 'center',
    gap: '10px',
    flexWrap: 'nowrap' as const,
    flexShrink: 0,
  },
  searchWrapper: {
    display: 'flex',
    alignItems: 'center',
    gap: '6px',
    padding: '6px 12px',
    border: 'none',
    borderRadius: '8px',
    background: '#ffffff',
    flex: '1 1 auto',
    minWidth: '400px',
  },
  searchInput: {
    flex: 1,
    border: 'none',
    outline: 'none',
    fontSize: '13px',
    color: 'var(--color-on-surface)',
    background: 'transparent',
    fontFamily: 'inherit',
  },
  clearIcon: {
    display: 'inline-flex',
    alignItems: 'center',
    border: 'none',
    background: 'transparent',
    cursor: 'pointer',
    color: 'var(--color-on-surface-variant)',
    padding: '2px',
  },
  dropdownBtn: {
    display: 'flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '500' as const,
    color: 'var(--color-on-surface-variant)',
    background: 'var(--color-surface-container-lowest)',
    border: '1px solid rgba(188, 201, 198, 0.3)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
    whiteSpace: 'nowrap' as const,
    transition: 'all var(--transition-fast)',
  },
  filterCount: {
    fontSize: '10px',
    fontWeight: '700' as const,
    padding: '0 5px',
    borderRadius: '10px',
    background: 'var(--color-primary)',
    color: '#fff',
    lineHeight: '16px',
  },
  dropdownMenu: {
    position: 'absolute' as const,
    top: '100%',
    left: 0,
    marginTop: '4px',
    minWidth: '140px',
    background: 'rgba(247, 249, 251, 0.85)',
    backdropFilter: 'blur(16px)',
    WebkitBackdropFilter: 'blur(16px)',
    border: '1px solid rgba(188, 201, 198, 0.15)',
    borderRadius: '10px',
    boxShadow: '0 4px 20px rgba(25, 28, 30, 0.06)',
    zIndex: 100,
    overflow: 'hidden',
  },
  dropdownItem: {
    display: 'block',
    width: '100%',
    padding: '8px 14px',
    fontSize: '13px',
    fontWeight: '400' as const,
    color: 'var(--color-on-surface)',
    background: 'transparent',
    border: 'none',
    cursor: 'pointer',
    textAlign: 'left' as const,
    fontFamily: 'inherit',
    transition: 'background 100ms ease',
  },
  clearBtn: {
    display: 'inline-flex',
    alignItems: 'center',
    gap: '4px',
    padding: '6px 12px',
    fontSize: '13px',
    fontWeight: '600' as const,
    color: 'var(--color-on-surface-variant)',
    background: 'transparent',
    border: '1px solid rgba(188, 201, 198, 0.3)',
    borderRadius: '8px',
    cursor: 'pointer',
    fontFamily: 'inherit',
  },
} as const

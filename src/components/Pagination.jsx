const BTN = {
  background: 'none',
  border: '1px solid #1e1e1e',
  borderRadius: 6,
  color: '#e5e5e5',
  cursor: 'pointer',
  fontSize: '0.8rem',
  padding: '6px 14px',
  transition: 'background 0.15s',
}

const BTN_DISABLED = {
  ...BTN,
  color: '#2a2a2a',
  borderColor: '#2a2a2a',
  cursor: 'default',
}

export const PAGE_SIZE = 10

export default function Pagination({ page, totalPages, onPrev, onNext, totalItems }) {
  if (totalPages <= 1) return null

  const from = (page - 1) * PAGE_SIZE + 1
  const to   = Math.min(page * PAGE_SIZE, totalItems)

  return (
    <div style={{
      display: 'flex', alignItems: 'center', justifyContent: 'space-between',
      padding: '12px 4px', marginTop: 8,
      borderTop: '1px solid #1e1e1e',
    }}>
      <button
        style={page === 1 ? BTN_DISABLED : BTN}
        disabled={page === 1}
        onClick={onPrev}
      >
        ← Prev
      </button>

      <div style={{ textAlign: 'center' }}>
        <div style={{ fontSize: '0.78rem', color: '#e5e5e5', fontWeight: 600 }}>
          Page {page} of {totalPages}
        </div>
        <div style={{ fontSize: '0.68rem', color: '#555', marginTop: 2 }}>
          {from}–{to} of {totalItems} books
        </div>
      </div>

      <button
        style={page === totalPages ? BTN_DISABLED : BTN}
        disabled={page === totalPages}
        onClick={onNext}
      >
        Next →
      </button>
    </div>
  )
}

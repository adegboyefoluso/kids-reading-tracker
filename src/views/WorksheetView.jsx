import { useState, useEffect, useRef, useCallback } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession } from '../services/auth'

const GRADES   = ['K','1','2','3','4','5','6','7','8','9','10','11','12']
const CANVAS_BG = '#111111'
const DOT_CLR   = '#222222'

// Pen colour swatches
const PENS = [
  { color: '#e5e5e5', label: 'White'  },
  { color: '#93c5fd', label: 'Blue'   },
  { color: '#86efac', label: 'Green'  },
  { color: '#fca5a5', label: 'Red'    },
]

// Draw dot-grid on canvas (called after every clear)
function drawGrid(canvas) {
  const ctx = canvas.getContext('2d')
  ctx.fillStyle = CANVAS_BG
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.fillStyle = DOT_CLR
  const sp = 28
  for (let x = sp; x < canvas.width; x += sp)
    for (let y = sp; y < canvas.height; y += sp) {
      ctx.beginPath()
      ctx.arc(x, y, 1.3, 0, Math.PI * 2)
      ctx.fill()
    }
}

export default function WorksheetView() {
  const navigate     = useNavigate()
  const session      = getSession()
  const canvasRef    = useRef(null)
  const containerRef = useRef(null)
  const drawingRef   = useRef(false)
  const lastXY       = useRef(null)

  const [phase,      setPhase]      = useState('pick')
  const [grade,      setGrade]      = useState(() => localStorage.getItem('testGrade') || '')
  const [problems,   setProblems]   = useState([])
  const [currentQ,   setCurrentQ]   = useState(0)
  const [showAnswer, setShowAnswer] = useState(false)
  const [loading,    setLoading]    = useState(false)
  const [error,      setError]      = useState(null)
  const [done,       setDone]       = useState(false)

  // Drawing tool state
  const [tool,      setTool]      = useState('pen')
  const [penColor,  setPenColor]  = useState(PENS[0].color)
  const [lineWidth, setLineWidth] = useState(3)

  const gradeLabel = grade === 'K' ? 'Kindergarten' : grade ? `Grade ${grade}` : ''
  const q = problems[currentQ]

  useEffect(() => { if (grade) localStorage.setItem('testGrade', grade) }, [grade])

  // ── Resize canvas, preserving drawn content ──────────────────────────────
  const resizeCanvas = useCallback(() => {
    const canvas    = canvasRef.current
    const container = containerRef.current
    if (!canvas || !container) return
    const w = container.clientWidth
    const h = container.clientHeight
    if (w === canvas.width && h === canvas.height) return

    // Snapshot current content
    const snap = document.createElement('canvas')
    snap.width = canvas.width; snap.height = canvas.height
    snap.getContext('2d').drawImage(canvas, 0, 0)

    canvas.width = w; canvas.height = h
    drawGrid(canvas)

    // Restore scaled
    if (snap.width && snap.height)
      canvas.getContext('2d').drawImage(snap, 0, 0, w, h)
  }, [])

  useEffect(() => {
    if (phase !== 'workbook') return
    const ro = new ResizeObserver(resizeCanvas)
    if (containerRef.current) { ro.observe(containerRef.current); resizeCanvas() }
    return () => ro.disconnect()
  }, [phase, resizeCanvas])

  // Clear canvas + reset answer visibility each time question changes
  useEffect(() => {
    if (phase !== 'workbook') return
    const canvas = canvasRef.current
    if (canvas && canvas.width) drawGrid(canvas)
    setShowAnswer(false)
  }, [currentQ, phase])

  // ── Canvas coordinate helper ───────────────────────────────────────────────
  function getXY(e) {
    const canvas = canvasRef.current
    const rect   = canvas.getBoundingClientRect()
    const sx     = canvas.width  / rect.width
    const sy     = canvas.height / rect.height
    const src    = e.touches ? e.touches[0] : e
    return { x: (src.clientX - rect.left) * sx, y: (src.clientY - rect.top) * sy }
  }

  // ── Drawing handlers ───────────────────────────────────────────────────────
  function startDraw(e) {
    drawingRef.current = true
    lastXY.current     = getXY(e)
  }
  function draw(e) {
    if (!drawingRef.current) return
    const canvas = canvasRef.current
    const ctx    = canvas.getContext('2d')
    const pos    = getXY(e)
    ctx.beginPath()
    ctx.moveTo(lastXY.current.x, lastXY.current.y)
    ctx.lineTo(pos.x, pos.y)
    if (tool === 'eraser') {
      ctx.strokeStyle = CANVAS_BG
      ctx.lineWidth   = 28
    } else {
      ctx.strokeStyle = penColor
      ctx.lineWidth   = lineWidth
    }
    ctx.lineCap = ctx.lineJoin = 'round'
    ctx.stroke()
    lastXY.current = pos
  }
  function stopDraw() { drawingRef.current = false; lastXY.current = null }

  function clearCanvas() {
    const c = canvasRef.current
    if (c) drawGrid(c)
  }

  // ── Load problems from API ─────────────────────────────────────────────────
  async function generate() {
    if (!grade) return
    setLoading(true); setError(null)
    try {
      const r    = await fetch(`/api/grade?worksheet=1&grade=${encodeURIComponent(grade)}&t=${Date.now()}`)
      if (!r.ok) throw new Error('Could not load problems. Please try again.')
      const data = await r.json()
      if (!Array.isArray(data) || !data.length)
        throw new Error('No problems returned. Please try again.')
      setProblems(data)
      setCurrentQ(0)
      setDone(false)
      setPhase('workbook')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ══════════════════════════════════════════════════════════════════════════
  // PICK
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'pick') return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
      <div style={{ width: '100%', maxWidth: 480 }}>

        {/* Header */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
          <button onClick={() => navigate('/')}
            style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.3rem', padding: 0, lineHeight: 1 }}>
            ←
          </button>
          <div>
            <h1 style={{ color: '#e5e5e5', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>📝 Math Workbook</h1>
            {session && <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>Hi {session.name || 'there'}! Pick your grade to begin.</div>}
          </div>
        </div>

        {/* Info card */}
        <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12, padding: '14px 16px', marginBottom: 24 }}>
          <div style={{ color: '#e5e5e5', fontSize: '0.88rem', fontWeight: 600, marginBottom: 6 }}>How it works</div>
          <div style={{ color: '#6b7280', fontSize: '0.8rem', lineHeight: 1.75 }}>
            Each problem appears one at a time with a <strong style={{ color: '#e5e5e5' }}>dot-grid canvas</strong> — use it exactly like a notebook to write your working out. Tap <strong style={{ color: '#e5e5e5' }}>Next</strong> to clear the screen and move to the next problem. Tap <strong style={{ color: '#e5e5e5' }}>Show Answer</strong> any time to reveal the worked solution.
          </div>
        </div>

        {/* Grade picker */}
        <div style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
          Grade Level <span style={{ color: '#ef4444', fontSize: '0.7rem' }}>*required</span>
        </div>
        <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6, marginBottom: 6 }}>
          {GRADES.map(g => (
            <button key={g} onClick={() => setGrade(g)}
              style={{
                flexShrink: 0, minWidth: 38, textAlign: 'center',
                background:   grade === g ? '#1d4ed8' : '#141414',
                border:       `2px solid ${grade === g ? '#3b82f6' : '#1e1e1e'}`,
                borderRadius: 8, padding: '8px 0', cursor: 'pointer',
                color:        grade === g ? '#fff' : '#9ca3af',
                fontSize: '0.82rem', fontWeight: 700, transition: 'all 0.15s',
              }}>
              {g}
            </button>
          ))}
        </div>
        <div style={{ minHeight: 22, marginBottom: 28 }}>
          {grade && <div style={{ color: '#3b82f6', fontSize: '0.73rem' }}>✓ Will generate curriculum-level {gradeLabel} problems</div>}
        </div>

        {error && (
          <div style={{ background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: 16 }}>
            ❌ {error}
          </div>
        )}

        <button onClick={generate} disabled={!grade || loading}
          style={{
            width: '100%', border: 'none', borderRadius: 12, padding: '16px',
            background: grade ? '#1d4ed8' : '#1a1a1a',
            cursor:     grade && !loading ? 'pointer' : 'not-allowed',
            color:      grade ? '#fff' : '#4b5563',
            fontSize: '1rem', fontWeight: 700,
            display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
          }}>
          {loading ? '⏳ Loading problems…' : grade ? `📝 Open ${gradeLabel} Workbook` : '← Pick a grade first'}
        </button>
        <div style={{ color: '#4b5563', fontSize: '0.72rem', textAlign: 'center', marginTop: 12 }}>
          20 curriculum-level problems · Draw your working · Check answers
        </div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // DONE
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'workbook' && done) return (
    <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '20px 16px' }}>
      <div style={{ textAlign: 'center', maxWidth: 360 }}>
        <div style={{ fontSize: '4rem', marginBottom: 12 }}>🎉</div>
        <h1 style={{ color: '#e5e5e5', fontSize: '1.4rem', fontWeight: 700, margin: '0 0 8px' }}>Excellent Work!</h1>
        <div style={{ color: '#6b7280', fontSize: '0.88rem', lineHeight: 1.7, marginBottom: 32 }}>
          You've worked through all 20 {gradeLabel} problems.<br />Keep practising every day to sharpen your skills! 💪
        </div>
        <div style={{ display: 'flex', gap: 10, justifyContent: 'center' }}>
          <button onClick={() => { setPhase('pick'); setProblems([]); setDone(false) }}
            style={{ padding: '12px 20px', background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10, cursor: 'pointer', color: '#e5e5e5', fontSize: '0.9rem', fontWeight: 600 }}>
            🔄 New Workbook
          </button>
          <button onClick={() => navigate('/')}
            style={{ padding: '12px 20px', background: '#1d4ed8', border: 'none', borderRadius: 10, cursor: 'pointer', color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
            📚 Back to Books
          </button>
        </div>
      </div>
    </div>
  )

  // ══════════════════════════════════════════════════════════════════════════
  // WORKBOOK — main screen
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'workbook' && q) return (
    <div style={{ height: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>

      {/* ── Header bar ── */}
      <div style={{
        display: 'flex', alignItems: 'center', justifyContent: 'space-between',
        padding: '10px 14px', borderBottom: '1px solid #1a1a1a',
        background: '#080808', flexShrink: 0, gap: 10,
      }}>
        <button onClick={() => setPhase('pick')}
          style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.2rem', padding: 0, flexShrink: 0 }}>
          ←
        </button>

        {/* Progress dots */}
        <div style={{ display: 'flex', gap: 4, flex: 1, justifyContent: 'center', flexWrap: 'wrap' }}>
          {problems.map((_, i) => (
            <div key={i} style={{
              width: 7, height: 7, borderRadius: '50%', transition: 'background 0.2s',
              background: i === currentQ ? '#3b82f6' : i < currentQ ? '#16a34a' : '#1e1e1e',
            }} />
          ))}
        </div>

        <div style={{ color: '#60a5fa', fontSize: '0.72rem', fontWeight: 700, background: '#1e3a8a', borderRadius: 99, padding: '3px 10px', whiteSpace: 'nowrap', flexShrink: 0 }}>
          {gradeLabel}
        </div>
      </div>

      {/* ── Problem card ── */}
      <div style={{
        padding: '12px 16px', borderBottom: '1px solid #1a1a1a',
        background: '#0d0d0d', flexShrink: 0,
        maxHeight: showAnswer ? '44vh' : '28vh', overflowY: 'auto',
        transition: 'max-height 0.3s',
      }}>
        <div style={{ display: 'flex', gap: 10, alignItems: 'flex-start' }}>
          <span style={{ color: '#4b5563', fontSize: '0.72rem', fontWeight: 700, paddingTop: 3, flexShrink: 0 }}>
            Q{currentQ + 1}.
          </span>
          <div style={{ color: '#e5e5e5', fontSize: '0.97rem', lineHeight: 1.7, fontWeight: 500 }}>
            {q.problem}
          </div>
        </div>

        {showAnswer && (
          <div style={{ marginTop: 12, padding: '10px 12px', background: '#071a0f', borderRadius: 8, border: '1px solid #14532d' }}>
            <div style={{ color: '#4ade80', fontSize: '0.7rem', fontWeight: 700, textTransform: 'uppercase', letterSpacing: '0.05em', marginBottom: 6 }}>
              ✓ Worked Solution
            </div>
            <div style={{ color: '#86efac', fontSize: '0.85rem', lineHeight: 1.75, whiteSpace: 'pre-wrap' }}>
              {q.answer}
            </div>
          </div>
        )}
      </div>

      {/* ── Canvas (fills remaining height) ── */}
      <div ref={containerRef} style={{ flex: 1, overflow: 'hidden', background: CANVAS_BG }}>
        <canvas
          ref={canvasRef}
          style={{ display: 'block', width: '100%', height: '100%', touchAction: 'none', cursor: 'crosshair' }}
          onMouseDown={startDraw}
          onMouseMove={draw}
          onMouseUp={stopDraw}
          onMouseLeave={stopDraw}
          onTouchStart={startDraw}
          onTouchMove={draw}
          onTouchEnd={stopDraw}
          onTouchCancel={stopDraw}
        />
      </div>

      {/* ── Toolbar ── */}
      <div style={{ borderTop: '1px solid #1a1a1a', background: '#080808', padding: '10px 14px 16px', flexShrink: 0 }}>

        {/* Tool row */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginBottom: 10 }}>

          {/* Colour swatches */}
          {PENS.map(p => (
            <button key={p.color} onClick={() => { setPenColor(p.color); setTool('pen') }}
              title={`${p.label} pen`}
              style={{
                width: 26, height: 26, borderRadius: '50%', background: p.color, padding: 0,
                border: `3px solid ${penColor === p.color && tool === 'pen' ? '#fff' : 'transparent'}`,
                boxShadow: penColor === p.color && tool === 'pen' ? '0 0 0 1px #333' : 'none',
                cursor: 'pointer', flexShrink: 0, transition: 'border-color 0.1s',
              }} />
          ))}

          {/* Eraser */}
          <button onClick={() => setTool('eraser')} title="Eraser"
            style={{
              height: 28, padding: '0 10px', borderRadius: 6, flexShrink: 0,
              background: tool === 'eraser' ? '#374151' : '#181818',
              border: `1px solid ${tool === 'eraser' ? '#6b7280' : '#2a2a2a'}`,
              cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', fontWeight: 600,
            }}>
            Erase
          </button>

          {/* Clear all */}
          <button onClick={clearCanvas} title="Clear canvas"
            style={{ height: 28, padding: '0 10px', borderRadius: 6, flexShrink: 0, background: '#181818', border: '1px solid #2a2a2a', cursor: 'pointer', color: '#9ca3af', fontSize: '0.75rem', fontWeight: 600 }}>
            Clear
          </button>

          <div style={{ flex: 1 }} />

          {/* Line thickness */}
          {[{ w: 2, label: 'S' }, { w: 4, label: 'M' }, { w: 8, label: 'L' }].map(({ w, label }) => (
            <button key={w} onClick={() => { setLineWidth(w); setTool('pen') }}
              title={`${label} stroke`}
              style={{
                width: 32, height: 28, borderRadius: 6, flexShrink: 0,
                background: lineWidth === w && tool !== 'eraser' ? '#1e3a8a' : '#181818',
                border: `1px solid ${lineWidth === w && tool !== 'eraser' ? '#3b82f6' : '#2a2a2a'}`,
                cursor: 'pointer', display: 'flex', alignItems: 'center', justifyContent: 'center',
              }}>
              <div style={{ borderRadius: '50%', background: '#e5e5e5', width: Math.max(w, 3), height: Math.max(w, 3) }} />
            </button>
          ))}
        </div>

        {/* Navigation row */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button onClick={() => currentQ > 0 && setCurrentQ(i => i - 1)} disabled={currentQ === 0}
            style={{
              flex: '0 0 70px', background: '#181818', border: '1px solid #2a2a2a', borderRadius: 8,
              padding: '11px 0', cursor: currentQ === 0 ? 'not-allowed' : 'pointer',
              color: currentQ === 0 ? '#333' : '#9ca3af', fontSize: '0.85rem', fontWeight: 600,
            }}>
            ← Prev
          </button>

          <button onClick={() => setShowAnswer(a => !a)}
            style={{
              flex: 1, borderRadius: 8, padding: '11px 8px',
              background: showAnswer ? '#071a0f' : '#181818',
              border: `1px solid ${showAnswer ? '#14532d' : '#2a2a2a'}`,
              cursor: 'pointer',
              color:  showAnswer ? '#4ade80' : '#6b7280',
              fontSize: '0.82rem', fontWeight: 600,
            }}>
            {showAnswer ? '✓ Hide Answer' : '👁 Show Answer'}
          </button>

          <button
            onClick={() => {
              if (currentQ < problems.length - 1) setCurrentQ(i => i + 1)
              else setDone(true)
            }}
            style={{
              flex: '0 0 80px', background: '#1d4ed8', border: 'none', borderRadius: 8,
              padding: '11px 0', cursor: 'pointer', color: '#fff', fontSize: '0.85rem', fontWeight: 700,
            }}>
            {currentQ < problems.length - 1 ? 'Next →' : 'Finish ✓'}
          </button>
        </div>

      </div>
    </div>
  )

  return null
}

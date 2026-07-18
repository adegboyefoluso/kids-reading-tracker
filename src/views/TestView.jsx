import { useState, useEffect } from 'react'
import { useNavigate } from 'react-router-dom'
import { getSession } from '../services/auth'
import { saveTestResult } from '../services/tests'

const SUBJECTS = [
  { key: 'math',    label: 'Mathematics',      emoji: '➕', category: 19, hasGrade: true  },
  { key: 'science', label: 'Science',           emoji: '🔬', category: 17, hasGrade: true  },
  { key: 'social',  label: 'Social Studies',    emoji: '🌎', category: null, hasGrade: true },
  { key: 'geo',     label: 'Geography',         emoji: '🌍', category: 22, hasGrade: false },
  { key: 'history', label: 'History',           emoji: '📜', category: 23, hasGrade: false },
  { key: 'general', label: 'General Knowledge', emoji: '🧠', category: 9,  hasGrade: false },
]

const DIFFICULTIES = [
  { key: 'easy',   label: 'Easy',   emoji: '😊', color: '#22c55e' },
  { key: 'medium', label: 'Medium', emoji: '🤔', color: '#f59e0b' },
  { key: 'hard',   label: 'Hard',   emoji: '🔥', color: '#ef4444' },
]

const GRADES = ['K','1','2','3','4','5','6','7','8','9','10','11','12']

function decodeHTML(str) {
  const txt = document.createElement('textarea')
  txt.innerHTML = str
  return txt.value
}

function shuffle(arr) {
  const a = [...arr]
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]]
  }
  return a
}

function getStars(pct) {
  if (pct >= 90) return '⭐⭐⭐⭐⭐'
  if (pct >= 70) return '⭐⭐⭐⭐'
  if (pct >= 50) return '⭐⭐⭐'
  if (pct >= 30) return '⭐⭐'
  return '⭐'
}

function getFeedback(pct) {
  if (pct >= 90) return "Outstanding! You're a superstar! 🌟"
  if (pct >= 70) return "Great job! You really know your stuff! 🎉"
  if (pct >= 50) return "Good work! Keep practising and you'll be amazing! 💪"
  if (pct >= 30) return "Nice try! Every test makes you smarter! 🧠"
  return "Don't give up — practice makes perfect! 📚"
}

export default function TestView() {
  const navigate = useNavigate()
  const session  = getSession()

  const [phase,       setPhase]       = useState('pick')
  const [subject,     setSubject]     = useState(null)
  const [difficulty,  setDifficulty]  = useState('easy')
  const [grade,       setGrade]       = useState(() => localStorage.getItem('testGrade') || '')
  const [questions,   setQuestions]   = useState([])
  const [currentQ,    setCurrentQ]    = useState(0)
  const [answers,     setAnswers]     = useState([])
  const [chosen,      setChosen]      = useState(null)
  const [options,     setOptions]     = useState([])
  const [explanation, setExplanation] = useState(null)
  const [loadingExp,  setLoadingExp]  = useState(false)
  const [loading,     setLoading]     = useState(false)
  const [error,       setError]       = useState(null)

  const q             = questions[currentQ]
  const usesGrade     = subject?.hasGrade
  const gradeLabel    = grade === 'K' ? 'Kindergarten' : grade ? `Grade ${grade}` : ''
  const canStart      = subject && (!usesGrade || grade)

  // Persist grade choice
  useEffect(() => { if (grade) localStorage.setItem('testGrade', grade) }, [grade])

  // Shuffle options when question changes
  useEffect(() => {
    if (!q) return
    // For AI questions options are already in the array; for OTD we combine
    const allOpts = q.options
      ? q.options  // AI-generated already have shuffled options
      : shuffle([q.correct_answer, ...q.incorrect_answers])
    setOptions(allOpts)
    setChosen(null)
    setExplanation(null)
  }, [currentQ, questions])

  // Save result when phase reaches 'result'
  useEffect(() => {
    if (phase !== 'result' || !subject || !questions.length) return
    saveTestResult({
      subject:      subject.key,
      subjectLabel: subject.label,
      difficulty:   usesGrade ? `Grade ${grade}` : difficulty,
      score:        answers.filter(a => a.isCorrect).length,
      total:        questions.length,
      grade:        grade || '',
    }).catch(() => {})
  }, [phase])

  // ── Start test ─────────────────────────────────────────────────────────────
  async function startTest() {
    if (!canStart) return
    setLoading(true)
    setError(null)
    try {
      let fetched

      if (usesGrade && grade) {
        // ── AI-generated grade-specific questions (Math / Science) ───────────
        const r = await fetch(
          `/api/grade?quiz=1&grade=${encodeURIComponent(grade)}&subject=${subject.key}`
        )
        if (!r.ok) throw new Error('Could not generate questions. Please try again.')
        const data = await r.json()
        if (!Array.isArray(data) || !data.length)
          throw new Error('No questions generated. Please try again.')
        // Normalise to the same shape the rest of the UI expects
        fetched = data.map(item => ({
          question:      item.question,
          correct_answer: item.correct,
          incorrect_answers: (item.options || []).filter(o => o !== item.correct),
          options:       item.options || shuffle([item.correct, ...(item.options || []).filter(o => o !== item.correct)]),
        }))
      } else {
        // ── Open Trivia DB (Geography / History / General Knowledge) ──────────
        const url = `https://opentdb.com/api.php?amount=25&category=${subject.category}&difficulty=${difficulty}&type=multiple`
        const r   = await fetch(url)
        if (!r.ok) throw new Error('Could not reach quiz server. Check your internet connection.')
        const data = await r.json()
        if (data.response_code !== 0 || !data.results?.length)
          throw new Error('No questions available. Try a different difficulty.')
        fetched = data.results.map(item => ({
          question:          decodeHTML(item.question),
          correct_answer:    decodeHTML(item.correct_answer),
          incorrect_answers: item.incorrect_answers.map(decodeHTML),
        }))
      }

      setQuestions(fetched)
      setCurrentQ(0)
      setAnswers([])
      setPhase('test')
    } catch (e) {
      setError(e.message)
    } finally {
      setLoading(false)
    }
  }

  // ── Handle answer tap ─────────────────────────────────────────────────────
  async function handleAnswer(option) {
    if (chosen !== null) return
    const isCorrect = option === q.correct_answer
    setChosen(option)
    setAnswers(prev => [...prev, { chosen: option, correct: q.correct_answer, isCorrect, question: q.question }])

    if (!isCorrect) {
      setLoadingExp(true)
      try {
        const r = await fetch(`/api/grade?wolfram=1&q=${encodeURIComponent(q.question)}`)
        if (r.ok) {
          const data = await r.json()
          setExplanation(data.explanation || null)
        }
      } catch {}
      setLoadingExp(false)
    }
  }

  function nextQuestion() {
    if (currentQ < questions.length - 1) setCurrentQ(i => i + 1)
    else setPhase('result')
  }

  const score = answers.filter(a => a.isCorrect).length
  const pct   = questions.length ? Math.round((score / questions.length) * 100) : 0

  // ══════════════════════════════════════════════════════════════════════════
  // Phase: PICK
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'pick') {
    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 28 }}>
            <button onClick={() => navigate('/')}
              style={{ background: 'none', border: 'none', color: '#6b7280', cursor: 'pointer', fontSize: '1.3rem', padding: 0, lineHeight: 1 }}>
              ←
            </button>
            <div>
              <h1 style={{ color: '#e5e5e5', fontSize: '1.2rem', fontWeight: 700, margin: 0 }}>🧠 Take a Test</h1>
              {session && <div style={{ color: '#6b7280', fontSize: '0.75rem', marginTop: 2 }}>Hi {session.name || 'there'}! Pick a subject below.</div>}
            </div>
          </div>

          {/* Subject grid */}
          <div style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
            Choose a Subject
          </div>
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 10, marginBottom: 24 }}>
            {SUBJECTS.map(s => (
              <button key={s.key} onClick={() => setSubject(s)}
                style={{
                  background:   subject?.key === s.key ? '#1e3a8a' : '#141414',
                  border:       `2px solid ${subject?.key === s.key ? '#3b82f6' : '#1e1e1e'}`,
                  borderRadius: 12, padding: '16px 12px', cursor: 'pointer',
                  display: 'flex', alignItems: 'center', gap: 10, textAlign: 'left',
                  transition: 'border-color 0.15s, background 0.15s', position: 'relative',
                }}>
                <span style={{ fontSize: '1.8rem', lineHeight: 1 }}>{s.emoji}</span>
                <div>
                  <div style={{ color: '#e5e5e5', fontSize: '0.85rem', fontWeight: 600 }}>{s.label}</div>
                  {s.hasGrade && (
                    <div style={{ color: '#3b82f6', fontSize: '0.65rem', marginTop: 2 }}>Grade K–12</div>
                  )}
                </div>
              </button>
            ))}
          </div>

          {/* ── Grade selector (Math & Science only) ── */}
          {usesGrade && (
            <div style={{ marginBottom: 24 }}>
              <div style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Grade Level <span style={{ color: '#ef4444', fontSize: '0.7rem' }}>*required</span>
              </div>
              <div style={{ display: 'flex', gap: 6, overflowX: 'auto', paddingBottom: 6 }}>
                {GRADES.map(g => (
                  <button key={g} onClick={() => setGrade(g)}
                    style={{
                      flexShrink: 0,
                      background:   grade === g ? '#1d4ed8' : '#141414',
                      border:       `2px solid ${grade === g ? '#3b82f6' : '#1e1e1e'}`,
                      borderRadius: 8, padding: '8px 0', cursor: 'pointer',
                      color:        grade === g ? '#ffffff' : '#9ca3af',
                      fontSize: '0.82rem', fontWeight: 700,
                      minWidth: 38, textAlign: 'center',
                      transition: 'all 0.15s',
                    }}>
                    {g}
                  </button>
                ))}
              </div>
              {grade && (
                <div style={{ color: '#3b82f6', fontSize: '0.73rem', marginTop: 6 }}>
                  ✓ AI will generate {gradeLabel} {subject?.label} questions
                </div>
              )}
            </div>
          )}

          {/* ── Difficulty (non-grade subjects only) ── */}
          {!usesGrade && (
            <div style={{ marginBottom: 28 }}>
              <div style={{ color: '#6b7280', fontSize: '0.75rem', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.06em', marginBottom: 10 }}>
                Difficulty
              </div>
              <div style={{ display: 'flex', gap: 10 }}>
                {DIFFICULTIES.map(d => (
                  <button key={d.key} onClick={() => setDifficulty(d.key)}
                    style={{
                      flex: 1,
                      background:   difficulty === d.key ? d.color + '22' : '#141414',
                      border:       `2px solid ${difficulty === d.key ? d.color : '#1e1e1e'}`,
                      borderRadius: 12, padding: '14px 8px', cursor: 'pointer',
                      display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 6,
                    }}>
                    <span style={{ fontSize: '1.5rem', lineHeight: 1 }}>{d.emoji}</span>
                    <span style={{ color: difficulty === d.key ? d.color : '#9ca3af', fontSize: '0.82rem', fontWeight: 600 }}>{d.label}</span>
                  </button>
                ))}
              </div>
            </div>
          )}

          {usesGrade && <div style={{ marginBottom: 28 }} />}

          {error && (
            <div style={{ background: '#7f1d1d', border: '1px solid #ef4444', borderRadius: 8, padding: '10px 14px', color: '#fca5a5', fontSize: '0.85rem', marginBottom: 16 }}>
              ❌ {error}
            </div>
          )}

          <button onClick={startTest} disabled={!canStart || loading}
            style={{
              width: '100%',
              background:   canStart ? '#1d4ed8' : '#1a1a1a',
              border: 'none', borderRadius: 12, padding: '16px',
              cursor:       canStart && !loading ? 'pointer' : 'not-allowed',
              color:        canStart ? '#fff' : '#4b5563',
              fontSize: '1rem', fontWeight: 700,
              display: 'flex', alignItems: 'center', justifyContent: 'center', gap: 8,
            }}>
            {loading
              ? `⏳ Generating ${gradeLabel || ''} questions…`
              : canStart
                ? `🚀 Start ${subject.label} Test!`
                : usesGrade ? '← Pick a grade first' : '← Pick a subject first'}
          </button>

          <div style={{ color: '#4b5563', fontSize: '0.72rem', textAlign: 'center', marginTop: 12 }}>
            {usesGrade
              ? `25 AI-generated questions · Customised for ${gradeLabel || 'your grade'} · Explanations by Wolfram Alpha`
              : '25 multiple choice questions · Questions by Open Trivia DB · Explanations by Wolfram Alpha'}
          </div>
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Phase: TEST
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'test' && q) {
    const answered  = chosen !== null
    const correct   = chosen === q.correct_answer
    const diffMeta  = DIFFICULTIES.find(d => d.key === difficulty)

    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
        <div style={{ width: '100%', maxWidth: 480 }}>

          {/* Header */}
          <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 12 }}>
            <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
              <span style={{ fontSize: '1.2rem' }}>{subject.emoji}</span>
              <span style={{ color: '#e5e5e5', fontSize: '0.85rem', fontWeight: 600 }}>{subject.label}</span>
              {usesGrade && grade ? (
                <span style={{ color: '#3b82f6', fontSize: '0.72rem', fontWeight: 600,
                               background: '#1e3a8a', borderRadius: 99, padding: '2px 8px' }}>
                  {gradeLabel}
                </span>
              ) : (
                <span style={{ color: diffMeta?.color || '#9ca3af', fontSize: '0.72rem', fontWeight: 600,
                               background: (diffMeta?.color || '#9ca3af') + '22', borderRadius: 99, padding: '2px 8px' }}>
                  {diffMeta?.label}
                </span>
              )}
            </div>
            <div style={{ color: '#6b7280', fontSize: '0.82rem', fontWeight: 600 }}>
              {currentQ + 1} / {questions.length}
            </div>
          </div>

          {/* Progress bar */}
          <div style={{ height: 6, background: '#1e1e1e', borderRadius: 3, marginBottom: 16, overflow: 'hidden' }}>
            <div style={{ height: '100%', background: '#3b82f6', borderRadius: 3, transition: 'width 0.4s',
                          width: `${(answers.length / questions.length) * 100}%` }} />
          </div>

          {/* Score dots */}
          <div style={{ display: 'flex', gap: 6, marginBottom: 20, flexWrap: 'wrap' }}>
            {answers.map((a, i) => (
              <div key={i} style={{ width: 22, height: 22, borderRadius: '50%',
                                    background: a.isCorrect ? '#16a34a' : '#dc2626',
                                    display: 'flex', alignItems: 'center', justifyContent: 'center',
                                    fontSize: '0.65rem', color: '#fff', fontWeight: 700 }}>
                {a.isCorrect ? '✓' : '✗'}
              </div>
            ))}
            {Array.from({ length: questions.length - answers.length }).map((_, i) => (
              <div key={`e${i}`} style={{ width: 22, height: 22, borderRadius: '50%', background: '#1e1e1e' }} />
            ))}
          </div>

          {/* Question */}
          <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 14, padding: '20px 16px', marginBottom: 16 }}>
            <div style={{ color: '#e5e5e5', fontSize: '1rem', fontWeight: 600, lineHeight: 1.6 }}>
              {q.question}
            </div>
          </div>

          {/* Options */}
          <div style={{ display: 'flex', flexDirection: 'column', gap: 10, marginBottom: 16 }}>
            {options.map((opt, i) => {
              let bg = '#141414', border = '#1e1e1e', color = '#e5e5e5'
              if (answered) {
                if (opt === q.correct_answer)        { bg = '#14532d'; border = '#16a34a'; color = '#86efac' }
                else if (opt === chosen && !correct) { bg = '#7f1d1d'; border = '#dc2626'; color = '#fca5a5' }
                else                                  { color = '#4b5563' }
              }
              return (
                <button key={i} onClick={() => handleAnswer(opt)} disabled={answered}
                  style={{ background: bg, border: `2px solid ${border}`, borderRadius: 10,
                           padding: '14px 16px', cursor: answered ? 'default' : 'pointer',
                           color, fontSize: '0.92rem', fontWeight: 500, textAlign: 'left',
                           transition: 'background 0.2s, border-color 0.2s' }}>
                  {opt}
                </button>
              )
            })}
          </div>

          {/* Post-answer feedback */}
          {answered && (
            <div>
              <div style={{ background: correct ? '#14532d' : '#7f1d1d',
                            border: `1px solid ${correct ? '#16a34a' : '#dc2626'}`,
                            borderRadius: 10, padding: '12px 14px', marginBottom: 12 }}>
                <div style={{ color: correct ? '#86efac' : '#fca5a5', fontWeight: 700, fontSize: '0.9rem' }}>
                  {correct ? '✅ Correct! Well done!' : `❌ Not quite — the answer is: ${q.correct_answer}`}
                </div>
                {!correct && loadingExp && (
                  <div style={{ color: '#9ca3af', fontSize: '0.78rem', marginTop: 8 }}>🔮 Looking up explanation…</div>
                )}
                {!correct && !loadingExp && explanation && (
                  <div style={{ borderTop: '1px solid #374151', marginTop: 10, paddingTop: 10,
                                color: '#e5e5e5', fontSize: '0.82rem', lineHeight: 1.6 }}>
                    📖 <strong>Wolfram Alpha says:</strong> {explanation}
                  </div>
                )}
              </div>
              <button onClick={nextQuestion}
                style={{ width: '100%', background: '#1d4ed8', border: 'none', borderRadius: 10,
                         padding: '14px', cursor: 'pointer', color: '#fff', fontSize: '0.95rem', fontWeight: 700 }}>
                {currentQ < questions.length - 1 ? 'Next Question →' : 'See My Results 🎉'}
              </button>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ══════════════════════════════════════════════════════════════════════════
  // Phase: RESULT
  // ══════════════════════════════════════════════════════════════════════════
  if (phase === 'result') {
    const wrong        = answers.filter(a => !a.isCorrect)
    const circumference = 2 * Math.PI * 52
    const dash         = (score / questions.length) * circumference

    return (
      <div style={{ minHeight: '100vh', background: '#0a0a0a', display: 'flex', flexDirection: 'column', alignItems: 'center', padding: '20px 16px' }}>
        <div style={{ width: '100%', maxWidth: 480, textAlign: 'center' }}>

          <div style={{ fontSize: '3.5rem', marginBottom: 4 }}>🎉</div>
          <h1 style={{ color: '#e5e5e5', fontSize: '1.4rem', fontWeight: 700, margin: '0 0 4px' }}>Test Complete!</h1>
          <div style={{ color: '#6b7280', fontSize: '0.82rem', marginBottom: 24 }}>
            {subject.emoji} {subject.label}
            {usesGrade && grade ? ` · ${gradeLabel}` : ` · ${difficulty.charAt(0).toUpperCase() + difficulty.slice(1)}`}
          </div>

          {/* Score ring */}
          <div style={{ position: 'relative', width: 140, height: 140, margin: '0 auto 20px' }}>
            <svg width="140" height="140" style={{ transform: 'rotate(-90deg)' }}>
              <circle cx="70" cy="70" r="52" fill="none" stroke="#1e1e1e" strokeWidth="12" />
              <circle cx="70" cy="70" r="52" fill="none" stroke="#3b82f6" strokeWidth="12"
                strokeDasharray={`${dash} ${circumference}`} strokeLinecap="round" />
            </svg>
            <div style={{ position: 'absolute', inset: 0, display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
              <div style={{ color: '#e5e5e5', fontSize: '1.9rem', fontWeight: 800, lineHeight: 1 }}>{score}</div>
              <div style={{ color: '#6b7280', fontSize: '0.72rem' }}>of {questions.length}</div>
            </div>
          </div>

          <div style={{ fontSize: '1.4rem', marginBottom: 8 }}>{getStars(pct)}</div>
          <div style={{ color: '#e5e5e5', fontSize: '0.95rem', fontWeight: 600, marginBottom: 24 }}>{getFeedback(pct)}</div>

          {/* Wrong answer review */}
          {wrong.length > 0 && (
            <div style={{ background: '#141414', border: '1px solid #1e1e1e', borderRadius: 12,
                          padding: '16px', marginBottom: 20, textAlign: 'left' }}>
              <div style={{ color: '#6b7280', fontSize: '0.78rem', fontWeight: 600, marginBottom: 10 }}>
                📝 Questions to review ({wrong.length}):
              </div>
              {wrong.map((a, i) => (
                <div key={i} style={{ marginBottom: i < wrong.length - 1 ? 10 : 0,
                                      paddingBottom: i < wrong.length - 1 ? 10 : 0,
                                      borderBottom: i < wrong.length - 1 ? '1px solid #1e1e1e' : 'none' }}>
                  <div style={{ color: '#9ca3af', fontSize: '0.78rem', marginBottom: 4, lineHeight: 1.4 }}>{a.question}</div>
                  <div style={{ display: 'flex', gap: 12, fontSize: '0.73rem', flexWrap: 'wrap' }}>
                    <span style={{ color: '#fca5a5' }}>✗ You: {a.chosen}</span>
                    <span style={{ color: '#86efac' }}>✓ Answer: {a.correct}</span>
                  </div>
                </div>
              ))}
            </div>
          )}

          {/* Buttons */}
          <div style={{ display: 'flex', gap: 10 }}>
            <button onClick={() => { setPhase('pick'); setQuestions([]); setAnswers([]) }}
              style={{ flex: 1, background: '#141414', border: '1px solid #1e1e1e', borderRadius: 10,
                       padding: '14px', cursor: 'pointer', color: '#e5e5e5', fontSize: '0.9rem', fontWeight: 600 }}>
              🔄 Try Again
            </button>
            <button onClick={() => navigate('/')}
              style={{ flex: 1, background: '#1d4ed8', border: 'none', borderRadius: 10,
                       padding: '14px', cursor: 'pointer', color: '#fff', fontSize: '0.9rem', fontWeight: 600 }}>
              📚 Back to Books
            </button>
          </div>
        </div>
      </div>
    )
  }

  return null
}

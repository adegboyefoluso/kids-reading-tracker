async function fetchWithTimeout(url, options = {}, ms = 3000) {
  const ctrl = new AbortController()
  const t = setTimeout(() => ctrl.abort(), ms)
  try {
    const r = await fetch(url, { ...options, signal: ctrl.signal })
    clearTimeout(t)
    return r
  } catch (e) {
    clearTimeout(t)
    throw e
  }
}

// Three-strategy lookup — returns { description, source } or null
async function fetchBookDescription(isbn, title, author) {
  // ── Strategy 1: Google Books by ISBN (most precise) ──────────────────────
  if (isbn) {
    try {
      const r = await fetchWithTimeout(
        `https://www.googleapis.com/books/v1/volumes?q=isbn:${isbn}&maxResults=1`, {}, 3000)
      if (r.ok) {
        const d = await r.json()
        const desc = d.items?.[0]?.volumeInfo?.description
        if (desc && desc.length > 30) return { description: desc, source: 'isbn' }
      }
    } catch {}
  }

  // ── Strategy 2: Google Books with intitle + inauthor filters ─────────────
  if (title) {
    try {
      const parts = [`intitle:"${title}"`]
      if (author) parts.push(`inauthor:"${author}"`)
      const r = await fetchWithTimeout(
        `https://www.googleapis.com/books/v1/volumes?q=${encodeURIComponent(parts.join(' '))}&maxResults=3`, {}, 3000)
      if (r.ok) {
        const d = await r.json()
        for (const item of (d.items || [])) {
          const desc = item.volumeInfo?.description
          if (desc && desc.length > 30) return { description: desc, source: 'title+author' }
        }
      }
    } catch {}
  }

  // ── Strategy 3: Open Library by title search ──────────────────────────────
  if (title) {
    try {
      const q = encodeURIComponent(title.trim())
      const r = await fetchWithTimeout(
        `https://openlibrary.org/search.json?title=${q}&limit=3`, {}, 3000)
      if (r.ok) {
        const d = await r.json()
        // Open Library search gives us OLIDs — fetch the first work that has a description
        for (const doc of (d.docs || []).slice(0, 3)) {
          const olid = doc.key // e.g. /works/OL123W
          if (!olid) continue
          try {
            const wr = await fetchWithTimeout(
              `https://openlibrary.org${olid}.json`, {}, 3000)
            if (wr.ok) {
              const work = await wr.json()
              const desc = typeof work.description === 'string'
                ? work.description
                : work.description?.value
              if (desc && desc.length > 30) return { description: desc, source: 'openlibrary' }
            }
          } catch {}
        }
      }
    } catch {}
  }

  return null
}

// ── Shared topic maps (used by both quiz and worksheet handlers) ──────────────
const MATH_TOPICS = {
  K:  'counting 1–20, comparing numbers, basic shapes, simple addition and subtraction within 5',
  1:  'addition and subtraction within 20, counting to 120, measuring length, telling time to the hour',
  2:  'addition and subtraction within 100, skip counting, basic multiplication, coins and money, even and odd numbers',
  3:  'multiplication tables 1–10, division, fractions (½ ¼ ¾), area and perimeter, telling time',
  4:  'multi-digit multiplication and division, equivalent fractions, decimals, angles and shapes',
  5:  'fractions and mixed numbers, decimal operations, volume, order of operations, basic coordinate planes',
  6:  'ratios and rates, percentages, negative numbers, one-step equations, area of triangles and circles',
  7:  'proportional relationships, integers, two-step equations, scale drawings, probability',
  8:  'linear equations and functions, systems of equations, Pythagorean theorem, scientific notation, statistics',
  9:  'Algebra I: quadratic equations, polynomials, factoring, graphing parabolas, inequalities',
  10: 'Geometry: proofs, congruence, similarity, trigonometric ratios (sin, cos, tan), circles',
  11: 'Algebra II: complex numbers, logarithms, exponential functions, sequences and series, conic sections',
  12: 'Pre-Calculus or Calculus: limits, derivatives, integrals, vectors, parametric equations',
}
const SCIENCE_TOPICS = {
  K:  'living vs non-living things, basic animals (mammals, birds, fish), weather (sunny, rainy, snowy), plants needing sun and water',
  1:  'animal habitats, plant parts (roots, stem, leaf, flower), seasons, the five senses, push and pull forces',
  2:  'life cycles (butterfly, frog), food chains, states of matter (solid, liquid, gas), rocks and soil',
  3:  'ecosystems, simple machines (lever, wheel, pulley), light and shadows, plant reproduction, adaptations',
  4:  'electricity and circuits, magnetism, rock cycle, fossils, food webs, properties of sound',
  5:  'solar system and planets, matter and energy, photosynthesis, human body systems, water cycle',
  6:  'cells (plant vs animal), body systems (digestive, respiratory, circulatory), energy types, earth layers, weather vs climate',
  7:  'genetics and heredity, photosynthesis and respiration, chemical vs physical changes, motion (speed, velocity), plate tectonics',
  8:  'atoms and elements, periodic table basics, chemical reactions, waves (light, sound), natural selection',
  9:  'Biology: DNA structure, mitosis and meiosis, genetics, evolution, classification of living things',
  10: 'Chemistry: atomic structure, periodic trends, ionic and covalent bonds, balancing equations, stoichiometry',
  11: 'Physics: Newton\'s laws, work and energy, waves and optics, electric fields, thermodynamics',
  12: 'Advanced Biology, Organic Chemistry, or Environmental Science: ecosystems, sustainability, carbon cycle',
}
const SOCIAL_STUDIES_TOPICS = {
  K:  'family roles, community helpers (firefighters, teachers, doctors), rules at home and school, basic map concepts (home, neighborhood, town)',
  1:  'needs vs wants, community and neighborhood, maps and globes, US national symbols (flag, Pledge of Allegiance), basic calendar and timelines',
  2:  'local community and government, goods and services, map skills (continents, oceans), cultural traditions and holidays around the world',
  3:  'local and state government, economics (producers and consumers), US regions and geography, Native American cultures and history',
  4:  'state history and government, US regions in depth, immigration and culture, early European exploration of the Americas',
  5:  'US history: colonization, American Revolution, Declaration of Independence, Constitution, Bill of Rights, Westward expansion',
  6:  'ancient civilizations: Mesopotamia, Egypt, Greece, Rome, China, India — geography, culture, government and legacy',
  7:  'medieval world, world religions (Christianity, Islam, Judaism, Hinduism, Buddhism), Renaissance, Age of Exploration, African kingdoms',
  8:  'US history: Civil War, Reconstruction, Industrial Revolution, immigration waves, Progressive Era, rise of the United States',
  9:  'World History: Enlightenment, Atlantic revolutions (French, American), imperialism, World War I, early 20th century nationalism',
  10: 'World History: World War II, Holocaust, Cold War, decolonization, civil rights movements globally, contemporary globalization',
  11: 'US Government and Civics: Constitution, branches of government, federalism, civil liberties, Supreme Court, elections and civic participation',
  12: 'Economics: supply and demand, GDP, inflation, fiscal and monetary policy, international trade, personal finance, economic systems',
}

export default async function handler(req, res) {
  res.setHeader('Access-Control-Allow-Origin', '*')
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type')
  if (req.method === 'OPTIONS') return res.status(200).end()

  // ── GET /api/grade?worksheet=1&grade=X — Math workbook (open-answer) ───────
  if (req.method === 'GET' && req.query.worksheet) {
    const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
    if (!GROQ_API_KEY) return res.status(503).json({ error: 'Not configured' })

    const { grade } = req.query
    if (!grade) return res.status(400).json({ error: 'grade required' })

    const gradeLabel = grade === 'K' ? 'Kindergarten' : `Grade ${grade}`
    const gradeKey   = grade === 'K' ? 'K' : String(Math.min(12, Math.max(1, parseInt(grade) || 5)))

    // Detailed per-grade syllabus broken into individual subtopics so we can
    // pick a RANDOM SUBSET each call — this guarantees every session is different.
    const MATH_SYLLABUS = {
      K:  ['Counting objects 1–20','Number recognition and writing 0–20','One-to-one correspondence','Comparing groups: more, fewer, equal','Basic 2D shapes: circle, square, triangle, rectangle','Simple AB and ABC patterns','Addition: combining groups up to 10','Subtraction: taking away up to 10','Ordering numbers 0–10','Measuring length using non-standard units'],
      1:  ['Addition facts to 20','Subtraction facts to 20','Place value: tens and ones up to 99','Counting to 120 by 1s and 10s','Comparing two-digit numbers with <, >, =','Telling time to the hour and half-hour','Identifying coins and their values','Measuring length with a ruler (inches and cm)','Properties of 2D shapes','Even and odd numbers to 20'],
      2:  ['Adding two-digit numbers with regrouping','Subtracting two-digit numbers with regrouping','Multiplication as repeated addition','Place value up to hundreds','Skip-counting by 2s, 5s, 10s, and 100s','Telling time to the nearest 5 minutes','Counting money and making change','Basic fractions: halves, thirds, quarters','Bar graphs and pictographs','Measuring in centimetres and metres'],
      3:  ['Multiplication tables 1–10','Division as equal sharing and repeated subtraction','Multi-digit addition and subtraction','Fractions: unit fractions and fractions on a number line','Equivalent fractions','Comparing fractions with the same numerator or denominator','Area and perimeter of rectangles','Rounding to the nearest 10 and 100','Elapsed time word problems','Properties and categories of quadrilaterals'],
      4:  ['Multi-digit multiplication (up to 4-digit × 1-digit)','Long division with remainders','Adding and subtracting fractions with like denominators','Equivalent fractions and simplest form','Decimals to tenths and hundredths','Comparing and ordering decimals','Angles: measuring with a protractor, acute/right/obtuse/straight','Area and perimeter of composite shapes','Factors, multiples, prime and composite numbers','Line and rotational symmetry'],
      5:  ['Adding and subtracting fractions with unlike denominators','Multiplying fractions and mixed numbers','Dividing unit fractions by whole numbers and vice versa','Decimal multiplication and division','Order of operations (PEMDAS/BODMAS)','Volume of rectangular prisms','Coordinate planes: plotting and reading points in all four quadrants','Converting units of measurement (metric and customary)','Numerical patterns and rules','Prime factorisation and LCM/GCF'],
      6:  ['Ratios and equivalent ratios','Unit rates and rate problems','Percentages: finding the percent of a number, percent of change','Converting between fractions, decimals, and percentages','Negative numbers and absolute value on a number line','Writing and solving one-step equations','Area of triangles, parallelograms, and trapezoids','Surface area of rectangular prisms and pyramids','Volume of rectangular prisms and triangular prisms','Mean, median, mode, and range'],
      7:  ['Proportional relationships and constant of proportionality','Solving two-step equations with rational numbers','Adding and subtracting integers','Multiplying and dividing rational numbers','Percent problems: discount, tax, tip, interest, percent change','Scale drawings and scale factor','Experimental and theoretical probability','Area and circumference of circles','Angle relationships: supplementary, complementary, vertical, alternate','Simplifying algebraic expressions and combining like terms'],
      8:  ['Solving linear equations in one variable','Graphing linear functions y = mx + c','Slope and y-intercept from equations and graphs','Writing equations of lines (slope-intercept and point-slope)','Systems of two linear equations by substitution','Systems of two linear equations by elimination','Pythagorean theorem and its converse','Square roots, cube roots, and irrational numbers','Scientific notation: operations and comparisons','Volume of cones, cylinders, and spheres'],
      9:  ['Solving quadratic equations by factoring','Quadratic formula and the discriminant','Completing the square','Graphing parabolas: vertex, axis of symmetry, intercepts','Adding, subtracting, and multiplying polynomials','Factoring: GCF, difference of squares, trinomials','Rational exponents and radical expressions','Compound and absolute value inequalities','Functions: domain, range, function notation, and evaluation','Systems of linear and quadratic equations'],
      10: ['Triangle congruence proofs: SSS, SAS, ASA, AAS, HL','Triangle similarity: AA, SAS, SSS similarity','Trigonometric ratios: sin, cos, tan in right triangles','Solving right triangles using trigonometry','Law of sines and law of cosines','Circle theorems: arcs, chords, inscribed angles, tangents','Area and arc length of sectors','Coordinate geometry: distance formula, midpoint formula, slopes of parallel and perpendicular lines','Transformations: rotation, reflection, dilation, translation','Volume and surface area of composite solids'],
      11: ['Complex numbers: operations and the complex plane','Logarithms and logarithmic equations','Exponential growth and decay models','Polynomial functions: zeros, end behaviour, graphs','Rational functions and asymptotes','Arithmetic sequences and series','Geometric sequences and series (including sum formula)','Binomial theorem and Pascal\'s triangle','Conic sections: ellipse, hyperbola, parabola in standard form','Inverse functions and composition of functions'],
      12: ['Limits: definition, limit laws, one-sided limits','Continuity and the intermediate value theorem','Derivative rules: power, constant multiple, sum/difference','Product rule, quotient rule, chain rule','Derivatives of sin, cos, tan, exponential, and logarithmic functions','Applications of derivatives: increasing/decreasing, local extrema, optimisation','Related rates problems','Indefinite integrals and antiderivatives','Definite integrals and the fundamental theorem of calculus','Integration by substitution (u-substitution)'],
    }

    // Fisher-Yates shuffle
    function shuffle(arr) {
      const a = [...arr]
      for (let i = a.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]]
      }
      return a
    }

    const allSubtopics  = MATH_SYLLABUS[gradeKey] || MATH_TOPICS[gradeKey].split(',').map(s => s.trim())
    const sessionTopics = shuffle(allSubtopics).slice(0, 4)
    const sessionId     = Math.floor(Math.random() * 99999)

    const prompt = `You are an experienced maths teacher. This is session #${sessionId} — generate a COMPLETELY FRESH set of problems, different from any previous session.

Write exactly 20 rigorous, curriculum-appropriate mathematics problems for ${gradeLabel} students.

FOCUS TOPICS FOR THIS SESSION (cover all four, spread the 20 problems across them):
${sessionTopics.map((t, i) => `${i + 1}. ${t}`).join('\n')}

REQUIREMENTS:
- Difficulty must genuinely match ${gradeLabel} — use the correct vocabulary, notation, and complexity
- Every problem requires showing working/steps — not single-fact recall
- Write complete, standalone questions (NO "= ___" fill-in-the-blank)
- Vary the style: pure calculation, multi-step word problem, and reasoning/explain types
- Use different numbers, contexts, and scenarios than a typical textbook (be creative)
- For K–Grade 2: concrete, age-appropriate language; problems that need a drawn or written method
- For Grades 3–5: multi-step arithmetic, fractions, measurement, geometry word problems
- For Grades 6–8: algebraic equations, geometry calculations with units, proportion/percentage word problems
- For Grades 9–12: full rigour — correct mathematical notation, multi-step derivations, proofs
- "answer": complete worked solution with all key steps shown (2–5 concise lines, use → between steps)
- Double-check every answer for arithmetic and algebraic correctness before responding

Respond ONLY with valid JSON (no markdown, no extra text):
{"problems":[{"problem":"...","answer":"..."}]}`

    try {
      const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.85,
          max_tokens: 4000,
          response_format: { type: 'json_object' },
        }),
      }, 9000)
      if (!r.ok) return res.status(500).json({ error: 'Worksheet generation failed' })
      const data   = await r.json()
      const text   = data.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(text)
      return res.status(200).json(parsed.problems || [])
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── GET /api/grade?quiz=1&grade=X&subject=math — AI grade-level quiz ───────
  if (req.method === 'GET' && req.query.quiz) {
    const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
    if (!GROQ_API_KEY) return res.status(503).json({ error: 'Not configured' })

    const { grade, subject } = req.query
    if (!grade || !subject) return res.status(400).json({ error: 'grade and subject required' })

    const gradeLabel = grade === 'K' ? 'Kindergarten' : `Grade ${grade}`
    const subjectLabel = subject === 'math' ? 'Mathematics' : subject === 'science' ? 'Science' : 'Social Studies'

    const gradeKey = grade === 'K' ? 'K' : String(Math.min(12, Math.max(1, parseInt(grade) || 5)))
    const topics = subject === 'math' ? MATH_TOPICS[gradeKey] : subject === 'science' ? SCIENCE_TOPICS[gradeKey] : SOCIAL_STUDIES_TOPICS[gradeKey]

    const prompt = `You are a schoolteacher writing a quiz for ${gradeLabel} students.
Generate exactly 25 multiple choice ${subjectLabel} questions for ${gradeLabel}.

Topics to draw from: ${topics}

Rules:
- Language and vocabulary must match ${gradeLabel} reading level
- Each question must have exactly 1 correct answer and exactly 3 wrong (but plausible) answers
- Put the 4 options in a RANDOM order — do NOT always put the correct answer first or last
- Vary the question style (some recall, some reasoning, some calculation)
- For younger grades: use simple words, concrete examples, small numbers
- For higher grades: use proper technical vocabulary and harder values

Respond ONLY with valid JSON — no markdown, no explanation:
{"questions":[{"question":"<question text>","correct":"<correct answer>","options":["<A>","<B>","<C>","<D>"]}]}`

    try {
      const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.85,
          max_tokens: 4500,
          response_format: { type: 'json_object' },
        }),
      }, 9000)
      if (!r.ok) return res.status(500).json({ error: 'Quiz generation failed' })
      const data = await r.json()
      const text = data.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(text)
      return res.status(200).json(parsed.questions || [])
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  // ── GET /api/grade?wolfram=1&q=... — Wolfram Alpha explanation proxy ──────
  if (req.method === 'GET' && req.query.wolfram) {
    const WOLFRAM_APP_ID = (process.env.WOLFRAM_APP_ID || '').trim()
    if (!WOLFRAM_APP_ID) return res.status(200).json({ explanation: null })
    const { q } = req.query
    if (!q) return res.status(200).json({ explanation: null })
    try {
      // Primary: spoken API — natural language sentence kids can read
      const r = await fetchWithTimeout(
        `https://api.wolframalpha.com/v2/spoken?appid=${WOLFRAM_APP_ID}&i=${encodeURIComponent(q)}&units=metric`,
        {}, 7000
      )
      if (r.ok) {
        const text = await r.text()
        if (text && text.length > 3 &&
            !text.toLowerCase().includes('no spoken result') &&
            !text.toLowerCase().includes('wolfram alpha did not') &&
            !text.toLowerCase().includes('(no result)')) {
          return res.status(200).json({ explanation: text })
        }
      }
      // Fallback: short answer API
      const r2 = await fetchWithTimeout(
        `https://api.wolframalpha.com/v1/result?appid=${WOLFRAM_APP_ID}&i=${encodeURIComponent(q)}`,
        {}, 5000
      )
      if (r2.ok) {
        const text2 = await r2.text()
        if (text2 && text2.length > 1 && !text2.toLowerCase().includes('wolfram alpha did not')) {
          return res.status(200).json({ explanation: text2 })
        }
      }
    } catch {}
    return res.status(200).json({ explanation: null })
  }

  // ── GET /api/grade?recommend=1 — personalised book recommendations ────────
  if (req.method === 'GET' && req.query.recommend) {
    const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
    if (!GROQ_API_KEY) return res.status(503).json({ error: 'Not configured' })

    const { books: booksParam } = req.query   // JSON-encoded array of {title,author,genre}
    let readBooks = []
    try { readBooks = JSON.parse(booksParam || '[]') } catch {}
    if (!readBooks.length) return res.status(400).json({ error: 'No books provided' })

    const bookList = readBooks
      .map(b => `"${b.title}" by ${b.author}${b.genre ? ` (${b.genre})` : ''}`)
      .join('\n')

    const prompt = `You are a children's librarian helping a young reader aged 6–10 discover their next favourite book.

The reader has already read and finished these books:
${bookList}

Based on their reading history, recommend exactly 5 books they would likely enjoy next. Choose books that:
- Match their apparent taste in genres, themes and reading level
- Are real, well-known children's books that actually exist
- Are NOT already in their reading list above
- Are appropriate for ages 6–10

For each recommendation, write one short, enthusiastic sentence (max 15 words) explaining why they'll love it — written directly to the child in a fun encouraging tone.

Respond ONLY with valid JSON:
{"recommendations":[{"title":"<exact book title>","author":"<author full name>","reason":"<fun sentence for the child>"},...]}`

    try {
      const r = await fetch('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.7,
          max_tokens: 600,
          response_format: { type: 'json_object' },
        }),
      })
      if (!r.ok) return res.status(500).json({ error: 'Recommendation call failed' })
      const data = await r.json()
      const text = data.choices?.[0]?.message?.content || '{}'
      const parsed = JSON.parse(text)
      return res.status(200).json(parsed.recommendations || [])
    } catch (e) {
      return res.status(500).json({ error: e.message })
    }
  }

  if (req.method !== 'POST') return res.status(405).json({ error: 'Method not allowed' })

  const GROQ_API_KEY = (process.env.GROQ_API_KEY || '').trim()
  if (!GROQ_API_KEY) return res.status(503).json({ error: 'AI grading not configured — add GROQ_API_KEY to Vercel env vars' })

  // ── Math Tutor (learn) ─────────────────────────────────────────────────────
  if (req.body?.learnAction) {
    const { grade, topic, learnAction, messages = [], userAnswer } = req.body
    if (!grade || !topic) return res.status(400).json({ error: 'grade and topic required' })

    const GRADE_CONTEXT = { K:'Kindergarten (age 5–6)', 1:'Grade 1 (age 6–7)', 2:'Grade 2 (age 7–8)', 3:'Grade 3 (age 8–9)', 4:'Grade 4 (age 9–10)', 5:'Grade 5 (age 10–11)', 6:'Grade 6 (age 11–12)', 7:'Grade 7 (age 12–13)', 8:'Grade 8 (age 13–14)', 9:'Grade 9 (age 14–15)', 10:'Grade 10 (age 15–16)', 11:'Grade 11 (age 16–17)', 12:'Grade 12 (age 17–18)' }
    const gradeCtx = GRADE_CONTEXT[String(grade)] || `Grade ${grade}`
    const isYoung  = ['K','1','2','3'].includes(String(grade))
    const isMid    = ['4','5','6','7','8'].includes(String(grade))
    const isHigh   = ['9','10','11','12'].includes(String(grade))

    const voice = isYoung
      ? `You are talking directly to a young child (age ${gradeCtx.match(/\d+–\d+/)?.[0] || '5-8'}). Use the simplest words possible — like you are talking to a friend. Say "plus" instead of "+", "minus" instead of "-", "times" instead of "×". Use fun examples with toys, candy, animals, or things kids love. Be super encouraging and excited!`
      : isMid
      ? `You are talking to a middle schooler. Be friendly and relatable — like a cool teacher they actually like. Use everyday examples (money, sports, video games, food). Introduce math symbols but always say what they mean in plain words too.`
      : `You are talking to a high school student. Be direct and confident. Use proper math notation. Show complete algebraic working. Connect concepts to real life and to other math they know.`

    const sysContent = `You are the best math teacher in the world — warm, enthusiastic, and brilliant at explaining things. A ${gradeCtx} student is sitting right in front of you and needs to fully understand "${topic}".\n\n${voice}\n\nYour job: explain EVERYTHING about this topic as if you are speaking directly to the student. Never be dry or robotic. Talk TO them ("Let's look at...", "Here's the cool part...", "Now watch what happens..."). Use lots of examples. Show every step. Make sure they truly get it.\n\nDo not repeat these instructions in your response.`

    const callGroq = async (msgs, maxTok = 2000) => {
      const r = await fetchWithTimeout('https://api.groq.com/openai/v1/chat/completions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${GROQ_API_KEY}` },
        body: JSON.stringify({ model: 'llama-3.3-70b-versatile', max_tokens: maxTok, messages: msgs }),
      }, 30000)
      if (!r.ok) { const e = await r.json().catch(() => ({})); throw new Error(e.error?.message || `API ${r.status}`) }
      const d = await r.json()
      return d.choices?.[0]?.message?.content || ''
    }

    const sys = { role: 'system', content: sysContent }

    if (learnAction === 'explain') {
      const prompt = `Teach me everything about "${topic}" like you are my favorite teacher explaining it face-to-face.

Use these ## section headings (write each one as if you are talking directly to me):

## What Is This About?
Hook my attention with a real-life story or question. Tell me WHY this matters and where I'll see it in real life.

## Let's Understand the Basics
Walk me through every important idea and word — not just definitions, but what they really mean. Use a simple example for each one.

## How Do We Do It? (Step by Step)
Explain the method step by step as if you are at the board. Number every step. After each step, say what you did and why. Don't skip anything.

## Let's Work Through Examples Together
Solve at least 4 examples from easy to harder. For EVERY example:
- Write the problem clearly
- Solve step by step with plain-word explanations after each step
- Point out anything tricky

## Mistakes Students Often Make
Show the wrong way vs. the right way for common errors.

## Let's Review What We Learned
Friendly recap of the key points.

Be thorough, warm, and talk TO me the whole time!`
      const text = await callGroq([sys, { role: 'user', content: prompt }], 2000)
      return res.json({ text })
    }
    if (learnAction === 'chat') {
      if (!messages.length) return res.status(400).json({ error: 'messages required' })
      const chatSys = { role: 'system', content: sysContent + `\n\nThe student just read your lesson on "${topic}" and is asking a follow-up question — they may be confused about a specific part. Answer like a great teacher would: directly, clearly, with a fresh example if it helps. Keep it focused and friendly (under 200 words). If they name a specific section, zoom right into that.` }
      const text = await callGroq([chatSys, ...messages], 600)
      return res.json({ text })
    }
    if (learnAction === 'practice') {
      const text = await callGroq([sys, { role: 'user', content: `Give me exactly one practice problem about "${topic}" appropriate for a ${gradeCtx} student. State just the problem — no answer, no hint, no explanation.` }], 300)
      return res.json({ text })
    }
    if (learnAction === 'check') {
      if (!userAnswer || !messages.length) return res.status(400).json({ error: 'userAnswer and messages required' })
      const checkSys = { role: 'system', content: sysContent + `\n\nYou are checking a student's answer to a practice problem.\n- Start with "✅ Correct!" if the answer is right, or "Not quite — let's fix that!" if wrong.\n- If correct: briefly celebrate and reinforce why it's right (1–2 sentences).\n- If wrong: be encouraging, identify the specific mistake, then show the full correct solution step by step.\n- Keep response under 180 words.` }
      const text = await callGroq([checkSys, ...messages, { role: 'user', content: `My answer: ${userAnswer}` }], 400)
      return res.json({ text, correct: text.startsWith('✅') })
    }
    return res.status(400).json({ error: 'Unknown learnAction' })
  }

  const { isbn, title, author, summary, description: providedDescription } = req.body || {}
  if (!title || !summary) return res.status(400).json({ error: 'Title and summary required' })

  // Use stored description if provided (most reliable — fetched at search time).
  // Fall back to external fetch only if no stored description is available.
  let hasDescription = false
  let bookDescription = null
  if (providedDescription && providedDescription.length > 30) {
    hasDescription = true
    bookDescription = providedDescription
  } else {
    const bookResult = await fetchBookDescription(isbn, title, author)
    hasDescription = Boolean(bookResult)
    bookDescription = bookResult?.description || null
  }

  const aiDetectionInstruction = `
Also assess whether this summary was written by the child themselves or generated/rewritten by AI.
Look for these signs of AI authorship: overly formal or structured language for a young reader, perfect grammar with no natural mistakes, generic AI phrases (e.g. "In conclusion", "Furthermore", "It is worth noting"), sophisticated vocabulary inconsistent with a child's age, unnaturally balanced arguments, or lack of a genuine personal voice.
Add to your JSON:
- "aiDetection": integer 0–100 (0 = clearly written by the child, 100 = almost certainly AI-generated or AI-rewritten)
- "aiWarning": null if likely human (aiDetection ≤ 55), otherwise a single plain-English sentence explaining the concern`

  const correctionsInstruction = `
- "corrections": identify up to 6 CLEAR, UNAMBIGUOUS errors in the reader's summary. STRICT RULES — do NOT flag any of these: split infinitives ("to not do" is acceptable modern English), informal or colloquial phrases that are contextually fine (e.g. "went live on the news" is correct), style preferences, punctuation choices that don't cause confusion, or anything debatable. ONLY flag: definite misspellings (e.g. "recieve"), clear subject-verb disagreement (e.g. "they was"), wrong tense shift, repeated/missing words, or sentence structure so broken it confuses meaning. For each genuine error, copy the EXACT text from the summary (do NOT paraphrase — copy verbatim), then provide a fix. Format: [{"quote":"<exact phrase from summary, max 10 words>","type":"spelling"|"grammar"|"structure","issue":"<one short phrase>","fix":"<corrected version>"}]. Return [] if no definite errors exist — it is better to return [] than to flag something debatable.`

  const accuracyInstructions = `
6. Accuracy — THIS IS THE MOST CRITICAL CHECK. Compare every claim in the reader's summary against your knowledge of this book.

STRICT ACCURACY SCORING:
• If the reader described characters, plot events or outcomes that do NOT belong to this book → score 0 to 2
• If the summary sounds like it is about a completely different book → score 0 to 2
• If the reader got the main character, premise or ending wrong → score 0 to 3
• If the general theme is right but important specific details are wrong → score 3 to 5
• If mostly correct with only 1–2 minor inaccuracies → score 6 to 8
• If clearly and specifically matches the real book → score 9 to 10

CRITICAL: A beautifully written, grammatically perfect summary of the WRONG book must score 0–2 for accuracy. Writing quality does NOT affect the accuracy score. Do not give benefit of the doubt.

- "accuracyNote": One direct, honest sentence naming the specific difference between the summary and the real book, or confirming they got it right. Be concrete — name the characters or events that are wrong or right.
  Exception: if you have NO knowledge of this specific book at all, set accuracy to null and accuracyNote to "This book was not found in my knowledge base — accuracy could not be assessed."`

  const prompt = hasDescription
    ? `You are grading a young reader's book summary. You have a publisher/library description of the book AND your own trained knowledge of it — use both.

BOOK: "${title}" by ${author || 'unknown'}

PUBLISHER/LIBRARY DESCRIPTION:
${bookDescription.slice(0, 1500)}

Also draw on your own knowledge of this book (characters, plot details, themes, ending) to supplement the description above and verify the reader's summary as thoroughly as possible.

READER'S SUMMARY:
${summary}

Grade on SIX criteria (each 0–10):

1. Comprehension — Did they correctly understand the main plot, themes and key ideas of THIS book?
2. Detail — Did they include specific characters, events and details that actually appear in this book?
3. Reflection — Did they share a genuine personal opinion or what they personally learned?
4. Grammar — Spelling, punctuation and sentence construction. Deduct marks clearly for errors.
5. Structure — Is the summary well-organised with a clear beginning, middle and end? Does it flow logically?
${accuracyInstructions}

Also provide:
- "feedback": 2 short encouraging sentences about what they did well overall.
- "suggestions": Exactly 3 specific, actionable improvement tips written encouragingly for a young reader. Number them 1. 2. 3. on separate lines.
${aiDetectionInstruction}
${correctionsInstruction}

Respond ONLY with valid JSON:
{"score":<comprehension+detail+reflection+grammar+structure total, integer 0-50>,"comprehension":<0-10>,"detail":<0-10>,"reflection":<0-10>,"grammar":<0-10>,"structure":<0-10>,"accuracy":<0-10 or null>,"accuracyNote":"<1 direct sentence or null>","feedback":"<2 encouraging sentences>","suggestions":"<3 tips numbered 1. 2. 3.>","aiDetection":<0-100>,"aiWarning":<null or string>,"corrections":[]}`

    : `You are grading a young reader's book summary. No description was found in external databases, so use your own trained knowledge of the book to assess accuracy.

BOOK: "${title}" by ${author || 'unknown'}

Recall everything you know about this book from your training: its plot, characters, themes, key events and ending. Use that knowledge as your reference when comparing against the reader's summary.

READER'S SUMMARY:
${summary}

Grade on SIX criteria (each 0–10):

1. Comprehension — Did they correctly understand the main plot, themes and key ideas of THIS book?
2. Detail — Did they include specific characters, events and details that actually appear in this book?
3. Reflection — Did they share a genuine personal opinion or what they personally learned?
4. Grammar — Spelling, punctuation and sentence construction. Deduct marks clearly for errors.
5. Structure — Is the summary well-organised with a clear beginning, middle and end? Does it flow logically?
${accuracyInstructions}

Also provide:
- "feedback": 2 short encouraging sentences about what they did well overall.
- "suggestions": Exactly 3 specific, actionable improvement tips written encouragingly for a young reader. Number them 1. 2. 3. on separate lines.
${aiDetectionInstruction}
${correctionsInstruction}

Respond ONLY with valid JSON:
{"score":<comprehension+detail+reflection+grammar+structure total, integer 0-50>,"comprehension":<0-10>,"detail":<0-10>,"reflection":<0-10>,"grammar":<0-10>,"structure":<0-10>,"accuracy":<0-10 or null>,"accuracyNote":"<1 direct sentence or null>","feedback":"<2 encouraging sentences>","suggestions":"<3 tips numbered 1. 2. 3.>","aiDetection":<0-100>,"aiWarning":<null or string>,"corrections":[]}`

  try {
    const response = await fetchWithTimeout(
      'https://api.groq.com/openai/v1/chat/completions',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          'Authorization': `Bearer ${GROQ_API_KEY}`,
        },
        body: JSON.stringify({
          model: 'llama-3.3-70b-versatile',
          messages: [{ role: 'user', content: prompt }],
          temperature: 0.1,   // lower = more consistent / less lenient
          max_tokens: 1200,
          response_format: { type: 'json_object' },
        }),
      },
      8000
    )

    if (!response.ok) {
      const err = await response.json().catch(() => ({}))
      return res.status(500).json({ error: err.error?.message || 'Grading call failed' })
    }

    const data = await response.json()
    const text = data.choices?.[0]?.message?.content || ''
    const match = text.match(/\{[\s\S]*\}/)
    if (!match) return res.status(500).json({ error: 'Could not parse grade response' })
    const grade = JSON.parse(match[0])
    grade.bookFound = hasDescription
    // Return a preview of what description was used — admin can verify
    grade.bookDescriptionPreview = hasDescription ? bookDescription.slice(0, 250) : null
    return res.status(200).json(grade)
  } catch (e) {
    return res.status(500).json({ error: e.message })
  }
}

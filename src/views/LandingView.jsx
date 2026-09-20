import { useState } from 'react'
import { useNavigate } from 'react-router-dom'

export default function LandingView() {
  const navigate = useNavigate()
  const [activeTab, setActiveTab] = useState(null)

  const features = [
    {
      id: 'reading',
      icon: '📚',
      title: 'Book Rewards',
      description: 'Kids earn money by scanning and reading books',
      details: [
        'Scan ISBN barcodes with phone camera',
        'Auto-lookup book details from Open Library',
        'Instant rewards credited to balance',
        'Build a personal reading library',
      ],
      color: '#10b981'
    },
    {
      id: 'chores',
      icon: '🧹',
      title: 'Chore Tracking',
      description: 'Parents reward kids for completing chores',
      details: [
        'Create custom chore list with rewards',
        'Kids log completed chores anytime',
        'Parent approves and credits rewards',
        'Track chore history and earnings',
      ],
      color: '#fbbf24'
    },
    {
      id: 'khan',
      icon: '🎓',
      title: 'Khan Academy Hours',
      description: 'Encourage online learning with milestone rewards',
      details: [
        'Set monthly learning hour targets',
        'Admin logs hours at month end',
        'Proportional rewards: 70% target = 100% reward',
        'Track weekly progress toward goals',
      ],
      color: '#06b6d4'
    },
    {
      id: 'greenlight',
      icon: '💰',
      title: 'Green Light Accounts',
      description: 'Teach kids about money and investing',
      details: [
        'Parent creates account for each child',
        'Monitor all earnings in real-time',
        'Track spending and balance growth',
        'Foundation for financial literacy',
      ],
      color: '#fbbf24'
    },
  ]

  return (
    <div style={{ background: 'var(--bg)', minHeight: '100vh', color: 'var(--text)' }}>
      {/* Navigation */}
      <div style={{ background: 'var(--bg-card)', borderBottom: '1px solid var(--bg-shelf)', padding: '16px 20px', position: 'sticky', top: 0, zIndex: 100 }}>
        <div style={{ maxWidth: 1200, margin: '0 auto', display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
          <div style={{ fontSize: '1.5rem', fontWeight: 800, color: 'var(--gold)' }}>📖 Kids Reading Tracker</div>
          <button
            onClick={() => navigate('/setup')}
            style={{
              background: 'var(--gold)',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 8,
              padding: '10px 24px',
              fontWeight: 700,
              cursor: 'pointer',
              fontSize: '0.9rem',
              transition: 'all 0.2s'
            }}
            onMouseEnter={(e) => e.target.style.opacity = '0.8'}
            onMouseLeave={(e) => e.target.style.opacity = '1'}
          >
            Get Started →
          </button>
        </div>
      </div>

      {/* Hero Section */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '80px 20px 60px', textAlign: 'center' }}>
        <div style={{ fontSize: '3.5rem', fontWeight: 900, marginBottom: 16, color: 'var(--gold)' }}>
          Reward Kids for Learning
        </div>
        <div style={{ fontSize: '1.25rem', color: 'var(--text-muted)', marginBottom: 32, maxWidth: 600, margin: '0 auto', lineHeight: 1.6 }}>
          Turn reading, chores, and online learning into real rewards. Teach financial literacy while motivating your kids to read more and learn better.
        </div>
        <button
          onClick={() => navigate('/setup')}
          style={{
            background: 'var(--gold)',
            color: '#0a0a0a',
            border: 'none',
            borderRadius: 12,
            padding: '16px 40px',
            fontWeight: 800,
            cursor: 'pointer',
            fontSize: '1.1rem',
            transition: 'all 0.3s'
          }}
          onMouseEnter={(e) => {
            e.target.style.transform = 'translateY(-3px)'
            e.target.style.opacity = '0.8'
          }}
          onMouseLeave={(e) => {
            e.target.style.transform = 'translateY(0)'
            e.target.style.opacity = '1'
          }}
        >
          Start for Free
        </button>
      </div>

      {/* Features Grid */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 16, color: 'var(--text)' }}>How It Works</div>
          <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)' }}>Four powerful ways to motivate and reward</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 24, marginBottom: 60 }}>
          {features.map(feature => (
            <div
              key={feature.id}
              onClick={() => setActiveTab(activeTab === feature.id ? null : feature.id)}
              style={{
                background: 'var(--bg-card)',
                border: `2px solid ${activeTab === feature.id ? feature.color : 'var(--bg-shelf)'}`,
                borderRadius: 16,
                padding: 32,
                cursor: 'pointer',
                transition: 'all 0.3s',
                transform: activeTab === feature.id ? 'translateY(-8px)' : 'translateY(0)',
                boxShadow: activeTab === feature.id ? `0 0 20px ${feature.color}44` : 'none'
              }}
              onMouseEnter={(e) => {
                if (activeTab !== feature.id) {
                  e.currentTarget.style.transform = 'translateY(-4px)'
                }
              }}
              onMouseLeave={(e) => {
                if (activeTab !== feature.id) {
                  e.currentTarget.style.transform = 'translateY(0)'
                }
              }}
            >
              <div style={{ fontSize: '3rem', marginBottom: 16 }}>{feature.icon}</div>
              <div style={{ fontSize: '1.3rem', fontWeight: 700, marginBottom: 8, color: feature.color }}>
                {feature.title}
              </div>
              <div style={{ color: 'var(--text-muted)', marginBottom: 16, fontSize: '0.95rem' }}>
                {feature.description}
              </div>

              {activeTab === feature.id && (
                <div style={{ marginTop: 16, paddingTop: 16, borderTop: '1px solid var(--bg-shelf)' }}>
                  {feature.details.map((detail, i) => (
                    <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 10, color: 'var(--text)', fontSize: '0.9rem' }}>
                      <span style={{ color: feature.color, fontWeight: 700 }}>✓</span>
                      <span>{detail}</span>
                    </div>
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Benefits Section */}
      <div style={{ background: 'var(--bg-card)', padding: '60px 20px', borderTop: '1px solid var(--bg-shelf)', borderBottom: '1px solid var(--bg-shelf)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ textAlign: 'center', marginBottom: 50 }}>
            <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 16, color: 'var(--text)' }}>Why Parents Love It</div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 30 }}>
            {[
              { icon: '📈', title: 'Track Progress', desc: 'See reading and learning trends in real-time' },
              { icon: '💡', title: 'Motivate Learning', desc: 'Turn education into rewarding achievements' },
              { icon: '💰', title: 'Financial Lessons', desc: 'Teach kids about earning and saving' },
              { icon: '🎯', title: 'Set Goals', desc: 'Monthly targets for reading and learning' },
              { icon: '🏆', title: 'Celebrate Wins', desc: 'Badges and leaderboards for fun' },
              { icon: '📱', title: 'Works Everywhere', desc: 'Phone scanner, TV display, web app' },
            ].map((benefit, i) => (
              <div key={i} style={{ textAlign: 'center' }}>
                <div style={{ fontSize: '2.5rem', marginBottom: 12 }}>{benefit.icon}</div>
                <div style={{ fontSize: '1.1rem', fontWeight: 700, marginBottom: 6, color: 'var(--text)' }}>{benefit.title}</div>
                <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>{benefit.desc}</div>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* How to Start */}
      <div style={{ maxWidth: 1200, margin: '0 auto', padding: '60px 20px' }}>
        <div style={{ textAlign: 'center', marginBottom: 60 }}>
          <div style={{ fontSize: '2.5rem', fontWeight: 800, marginBottom: 16, color: 'var(--text)' }}>Get Started in 3 Steps</div>
        </div>

        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))', gap: 30 }}>
          {[
            {
              num: '1',
              title: 'Create Family Account',
              desc: 'Set up your family and add your kids with names, avatars, and reading levels.'
            },
            {
              num: '2',
              title: 'Set Goals & Rewards',
              desc: 'Configure reading targets, chore list, Khan hours, and reward amounts.'
            },
            {
              num: '3',
              title: 'Start Tracking',
              desc: 'Scan books, log chores, record Khan hours, and watch kids earn rewards!'
            },
          ].map((step, i) => (
            <div key={i} style={{ background: 'var(--bg-card)', border: '1px solid var(--bg-shelf)', borderRadius: 12, padding: 32 }}>
              <div style={{ fontSize: '2.5rem', fontWeight: 900, color: 'var(--gold)', marginBottom: 16 }}>{step.num}</div>
              <div style={{ fontSize: '1.2rem', fontWeight: 700, marginBottom: 12, color: 'var(--text)' }}>{step.title}</div>
              <div style={{ color: 'var(--text-muted)', lineHeight: 1.6 }}>{step.desc}</div>
            </div>
          ))}
        </div>
      </div>

      {/* Features List */}
      <div style={{ background: 'var(--bg-card)', padding: '60px 20px', borderTop: '1px solid var(--bg-shelf)' }}>
        <div style={{ maxWidth: 1200, margin: '0 auto' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 40, textAlign: 'center', color: 'var(--text)' }}>
            Packed with Features
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(250px, 1fr))', gap: 16 }}>
            {[
              '📚 ISBN Barcode Scanning',
              '🎥 Real-time TV Display',
              '💳 Balance Tracking',
              '🏆 Leaderboards',
              '🎓 Khan Academy Integration',
              '📊 Reading Analytics',
              '🧮 Chore Management',
              '📱 Mobile App (PWA)',
              '🌙 Dark/Light Mode',
              '👥 Multi-reader Support',
              '💰 Payment Tracking',
              '🎯 Reading Goals',
            ].map((feature, i) => (
              <div key={i} style={{ display: 'flex', alignItems: 'center', gap: 10, padding: '12px 0', color: 'var(--text)' }}>
                <span style={{ fontSize: '1.2rem' }}>{feature.split(' ')[0]}</span>
                <span>{feature.split(' ').slice(1).join(' ')}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* CTA Footer */}
      <div style={{ background: 'var(--bg-card)', padding: '60px 20px', textAlign: 'center', borderTop: '1px solid var(--bg-shelf)' }}>
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <div style={{ fontSize: '2rem', fontWeight: 800, marginBottom: 16, color: 'var(--text)' }}>
            Ready to Transform Reading?
          </div>
          <div style={{ fontSize: '1.1rem', color: 'var(--text-muted)', marginBottom: 32, lineHeight: 1.6 }}>
            Create your free family account today and start rewarding your kids for every book they read, chore they complete, and hour they learn.
          </div>
          <button
            onClick={() => navigate('/setup')}
            style={{
              background: 'var(--gold)',
              color: '#0a0a0a',
              border: 'none',
              borderRadius: 12,
              padding: '14px 36px',
              fontWeight: 800,
              cursor: 'pointer',
              fontSize: '1rem',
              transition: 'all 0.3s',
              marginBottom: 16
            }}
            onMouseEnter={(e) => {
              e.target.style.transform = 'scale(1.05)'
            }}
            onMouseLeave={(e) => {
              e.target.style.transform = 'scale(1)'
            }}
          >
            Get Started Free
          </button>
          <div style={{ color: 'var(--text-muted)', fontSize: '0.9rem' }}>
            No credit card required • Free forever • Open source
          </div>
        </div>
      </div>

      {/* Footer */}
      <div style={{ background: 'var(--bg)', padding: '20px', textAlign: 'center', color: 'var(--text-muted)', fontSize: '0.85rem', borderTop: '1px solid var(--bg-shelf)' }}>
        <div>© 2026 Kids Reading Tracker • <a href="#" style={{ color: 'var(--gold)', textDecoration: 'none' }}>GitHub</a> • <a href="#" style={{ color: 'var(--gold)', textDecoration: 'none' }}>Docs</a></div>
      </div>
    </div>
  )
}

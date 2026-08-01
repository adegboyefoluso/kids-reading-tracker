export default function Footer({ minimal = false }) {
  if (minimal) {
    return (
      <footer style={{
        background: '#111',
        color: '#888',
        padding: '16px',
        textAlign: 'center',
        fontSize: '12px',
        marginTop: '40px',
        borderTop: '1px solid #222'
      }}>
        <a href="/" style={{ color: '#fff', textDecoration: 'none', fontWeight: 600 }}>📚 Reading Tracker</a> |
        <a href="/admin" style={{ color: '#888', textDecoration: 'none', marginLeft: '12px' }}>Admin</a> |
        © 2026
      </footer>
    )
  }

  return (
    <footer style={{
      background: '#111',
      color: '#aaa',
      padding: '40px 20px',
      marginTop: '60px',
      borderTop: '1px solid #222'
    }}>
      <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
        <div style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))',
          gap: '40px',
          marginBottom: '40px'
        }}>
          {/* Branding */}
          <div>
            <h3 style={{ color: '#fff', fontSize: '18px', marginBottom: '12px' }}>📚 Reading Tracker</h3>
            <p style={{ fontSize: '13px', color: '#666', lineHeight: 1.6 }}>
              Track family reading progress, celebrate achievements, and make reading fun.
            </p>
          </div>

          {/* Navigation */}
          <div>
            <h4 style={{ color: '#fff', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Navigation</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '8px' }}>
                <a href="/" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Home</a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a href="/admin" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Admin Panel</a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a href="/analytics" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Analytics</a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a href="/buddy" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Buddy Chat</a>
              </li>
              <li>
                <a href="/leaderboard" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Leaderboard</a>
              </li>
            </ul>
          </div>

          {/* Features */}
          <div>
            <h4 style={{ color: '#fff', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Features</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '8px' }}>
                <a href="/chores" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Chores & Rewards</a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a href="/leaderboard" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Family Leaderboard</a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a href="/worksheet" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Reading Worksheets</a>
              </li>
              <li>
                <a href="/buddy" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Buddy Reading</a>
              </li>
            </ul>
          </div>

          {/* Support */}
          <div>
            <h4 style={{ color: '#fff', fontSize: '14px', fontWeight: 600, marginBottom: '16px' }}>Support</h4>
            <ul style={{ listStyle: 'none', padding: 0, margin: 0 }}>
              <li style={{ marginBottom: '8px' }}>
                <a href="mailto:support@readershall.com" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Contact Support</a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <a href="https://readershall.com" style={{ color: '#888', textDecoration: 'none', fontSize: '13px' }}>Website</a>
              </li>
              <li style={{ marginBottom: '8px' }}>
                <span style={{ color: '#666', fontSize: '13px' }}>Privacy Policy</span>
              </li>
              <li>
                <span style={{ color: '#666', fontSize: '13px' }}>Terms of Service</span>
              </li>
            </ul>
          </div>
        </div>

        {/* Bottom Section */}
        <div style={{
          borderTop: '1px solid #222',
          paddingTop: '24px',
          textAlign: 'center',
          color: '#666',
          fontSize: '12px'
        }}>
          <p style={{ margin: '0 0 8px' }}>
            © 2026 Reading Tracker. Made with ❤️ for families.
          </p>
          <p style={{ margin: '0' }}>
            Version 1.0.0 | Deployed on <a href="https://vercel.com" style={{ color: '#888', textDecoration: 'none' }}>Vercel</a>
          </p>
        </div>
      </div>
    </footer>
  )
}

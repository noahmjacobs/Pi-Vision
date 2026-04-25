import { useState, useEffect } from 'react'
import { DBClaude } from '../types'

interface ClaudePanelProps {
  claude: DBClaude
}

const RESPONSES = [
  'No new motion detected. The camera field looks clear and stable.',
  'I noticed increased activity near the doorway. This appears to be a regular entry pattern.',
  'The left side panel shows some reflective interference — this may trigger false positives.',
  'Package delivery confirmed at the entrance. Object classification confidence: 94%.',
  'Person re-identified from earlier session. Movement pattern is consistent with a resident.',
]

export default function ClaudePanel({ claude }: ClaudePanelProps) {
  const [query, setQuery] = useState('')
  const [response, setResponse] = useState(claude.lastAnalysis)
  const [loading, setLoading] = useState(false)

  // Sync if Firebase updates the analysis
  useEffect(() => {
    if (claude.lastAnalysis) setResponse(claude.lastAnalysis)
  }, [claude.lastAnalysis])

  function handleSend() {
    if (!query.trim()) return
    setLoading(true)
    setQuery('')
    const pick = RESPONSES[Math.floor(Math.random() * RESPONSES.length)]
    setTimeout(() => {
      setResponse(pick)
      setLoading(false)
    }, 900)
  }

  function handleKey(e: React.KeyboardEvent) {
    if (e.key === 'Enter') handleSend()
  }

  return (
    <div className="glass-card claude-card">
      <div className="claude-title">Claude Analysis</div>
      <p className="claude-analysis-text">
        {loading ? 'Analyzing feed…' : response}
      </p>
      <div className="claude-input-row">
        <input
          className="claude-input"
          placeholder="Ask Claude about the feed..."
          value={query}
          onChange={e => setQuery(e.target.value)}
          onKeyDown={handleKey}
        />
        <button className="claude-send-btn" onClick={handleSend} aria-label="Send">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="white" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
            <line x1="22" y1="2" x2="11" y2="13" />
            <polygon points="22 2 15 22 11 13 2 9 22 2" />
          </svg>
        </button>
      </div>
    </div>
  )
}

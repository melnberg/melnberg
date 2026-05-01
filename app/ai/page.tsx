'use client'

import { useState, useRef, useEffect } from 'react'

interface Source {
  id: string
  title: string
  url: string | null
}

export default function AiPage() {
  const [question, setQuestion] = useState('')
  const [answer, setAnswer] = useState('')
  const [sources, setSources] = useState<Source[]>([])
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const answerRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    if (answerRef.current) {
      answerRef.current.scrollTop = answerRef.current.scrollHeight
    }
  }, [answer])

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    if (!question.trim() || loading) return

    setLoading(true)
    setAnswer('')
    setSources([])
    setError('')

    try {
      const res = await fetch('/api/ai', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ question: question.trim() }),
      })

      if (!res.ok) {
        const data = await res.json()
        setError(data.error || '오류가 발생했습니다.')
        setLoading(false)
        return
      }

      const reader = res.body?.getReader()
      const decoder = new TextDecoder()
      if (!reader) { setError('스트림 오류'); setLoading(false); return }

      let buffer = ''
      while (true) {
        const { done, value } = await reader.read()
        if (done) break
        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('
')
        buffer = lines.pop() || ''

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))
              if (data.type === 'sources') setSources(data.sources)
              else if (data.type === 'text') setAnswer(prev => prev + data.text)
              else if (data.type === 'error') setError(data.message)
            } catch {}
          }
        }
      }
    } catch {
      setError('네트워크 오류가 발생했습니다.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="max-w-2xl mx-auto px-4 py-10">
      <h1 className="text-2xl font-bold mb-2">AI 질문</h1>
      <p className="text-sm text-gray-500 mb-8">
        카페 글 기반으로 답변합니다 · 베타 서비스
      </p>

      <form onSubmit={handleSubmit} className="mb-8">
        <textarea
          value={question}
          onChange={e => setQuestion(e.target.value)}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault()
              handleSubmit(e as unknown as React.FormEvent)
            }
          }}
          placeholder="궁금한 점을 입력하세요. (Shift+Enter 줄바꿈)"
          rows={3}
          className="w-full border border-gray-300 rounded-lg px-4 py-3 text-sm resize-none focus:outline-none focus:ring-2 focus:ring-[#0a2463]"
        />
        <button
          type="submit"
          disabled={loading || !question.trim()}
          className="mt-3 w-full bg-[#0a2463] text-white py-3 rounded-lg text-sm font-medium disabled:opacity-50 hover:bg-[#0d2d7a] transition"
        >
          {loading ? '답변 생성 중...' : '질문하기'}
        </button>
      </form>

      {error && (
        <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg px-4 py-3 text-sm mb-6">
          {error}
        </div>
      )}

      {(answer || loading) && (
        <div className="bg-gray-50 border border-gray-200 rounded-lg p-5 mb-6">
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-3">AI 답변</h2>
          <div
            ref={answerRef}
            className="text-sm text-gray-800 whitespace-pre-wrap leading-relaxed max-h-96 overflow-y-auto"
          >
            {answer}
            {loading && (
              <span className="inline-block w-1.5 h-4 bg-gray-400 animate-pulse ml-0.5 align-middle" />
            )}
          </div>
        </div>
      )}

      {sources.length > 0 && (
        <div>
          <h2 className="text-xs font-semibold text-gray-400 uppercase mb-3">참고 자료</h2>
          <ul className="space-y-2">
            {sources.map(source => (
              <li key={source.id}>
                {source.url ? (
                  <a
                    href={source.url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-sm text-[#0a2463] underline hover:opacity-70"
                  >
                    {source.title}
                  </a>
                ) : (
                  <span className="text-sm text-gray-600">{source.title}</span>
                )}
              </li>
            ))}
          </ul>
        </div>
      )}
    </div>
  )
}

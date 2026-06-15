'use client'

import { useEffect, useState, useRef, Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { supabase } from '@/lib/supabase'
import { getBranding } from '@/lib/branding'
import { useRouter } from 'next/navigation'

type Message = {
  role: 'user' | 'assistant'
  content: string
  streaming?: boolean
}

function InduccionContent() {
  const router = useRouter()
  const searchParams = useSearchParams()
  const agentSlug = searchParams.get('agent') ?? 'cultura'
  const [profile, setProfile] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)
  const [certificate, setCertificate] = useState<any>(null)
  const [initializing, setInitializing] = useState(true)
  const [moduleApproved, setModuleApproved] = useState<string | null>(null)
  const [completedModules, setCompletedModules] = useState<string[]>([])
  const messagesEndRef = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const init = async () => {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) { router.push('/login'); return }

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*, companies(*)')
        .eq('id', user.id)
        .single()

      if (!profileData) { router.push('/login'); return }

      setProfile(profileData)
      setCompany(profileData.companies)

      const currentAgentSlug = window.location.search.includes('agent=capacitacion') ? 'capacitacion' : 'cultura'

      // Cargar módulos completados
      const { data: modProgress } = await supabase
        .from('module_progress')
        .select('module_name')
        .eq('user_id', user.id)
        .eq('company_id', profileData.company_id)

      if (modProgress) {
        setCompletedModules(modProgress.map(m => m.module_name))
      }

      const { data: existingConv } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', profileData.company_id)
        .eq('agent_slug', currentAgentSlug)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      const { data: cert } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', profileData.company_id)
        .eq('agent_slug', currentAgentSlug)
        .maybeSingle()

      if (cert) { setCertificate(cert); setApproved(true) }

      if (existingConv) {
        setConversationId(existingConv.id)
        const { data: prevMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', existingConv.id)
          .order('created_at', { ascending: true })

        if (prevMessages && prevMessages.length > 0) {
          setMessages(prevMessages.map(m => ({ role: m.role as 'user' | 'assistant', content: m.content })))
        } else {
          await sendInitialMessage(profileData.companies.slug, existingConv.id, user.id)
        }
      } else {
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({ user_id: user.id, company_id: profileData.company_id, status: 'active', agent_slug: currentAgentSlug })
          .select().single()

        if (newConv) {
          setConversationId(newConv.id)
          await sendInitialMessage(profileData.companies.slug, newConv.id, user.id)
        }
      }
      setInitializing(false)
    }
    init()
  }, [router, agentSlug])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  // Auto-ocultar notificación de módulo
  useEffect(() => {
    if (moduleApproved) {
      const t = setTimeout(() => setModuleApproved(null), 5000)
      return () => clearTimeout(t)
    }
  }, [moduleApproved])

  const sendInitialMessage = async (slug: string, convId: string, userId: string) => {
    setLoading(true)
    const greeting = agentSlug === 'capacitacion'
      ? 'Hola, estoy listo para comenzar mi capacitación.'
      : 'Hola, estoy listo para comenzar mi inducción.'
    await sendStreamMessage(
      [{ role: 'user', content: greeting }],
      slug, convId, userId, true
    )
    setLoading(false)
  }

  const sendStreamMessage = async (
    msgs: Message[], slug: string, convId: string, userId: string, isInitial = false
  ) => {
    if (!isInitial) {
      setMessages(prev => [...prev, { role: 'assistant', content: '', streaming: true }])
    } else {
      setMessages([
        { role: 'user', content: agentSlug === 'capacitacion' ? 'Hola, estoy listo para comenzar mi capacitación.' : 'Hola, estoy listo para comenzar mi inducción.' },
        { role: 'assistant', content: '', streaming: true }
      ])
    }

    try {
      const res = await fetch('/api/agent', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          messages: msgs,
          company_slug: slug,
          agent_slug: agentSlug,
          conversation_id: convId,
          user_id: userId,
        })
      })

      if (!res.body) return

      const reader = res.body.getReader()
      const decoder = new TextDecoder()
      let buffer = ''

      while (true) {
        const { done, value } = await reader.read()
        if (done) break

        buffer += decoder.decode(value, { stream: true })
        const lines = buffer.split('\n')
        buffer = lines.pop() || ''

        let pendingChunks = ''
        let updateTimer: any = null

        const flushChunks = () => {
          if (pendingChunks) {
            const toFlush = pendingChunks
            pendingChunks = ''
            setMessages(prev => {
              const updated = [...prev]
              const last = updated[updated.length - 1]
              if (last.role === 'assistant') {
                updated[updated.length - 1] = { ...last, content: last.content + toFlush }
              }
              return updated
            })
          }
        }

        for (const line of lines) {
          if (line.startsWith('data: ')) {
            try {
              const data = JSON.parse(line.slice(6))

              if (data.chunk) {
                pendingChunks += data.chunk
                if (updateTimer) clearTimeout(updateTimer)
                updateTimer = setTimeout(flushChunks, 50)
              }

              if (data.done) {
                if (updateTimer) clearTimeout(updateTimer)
                flushChunks()
                setMessages(prev => {
                  const updated = [...prev]
                  const last = updated[updated.length - 1]
                  if (last.role === 'assistant') {
                    updated[updated.length - 1] = { ...last, streaming: false }
                  }
                  return updated
                })

                // Módulo aprobado
                if (data.moduleApproved) {
                  setModuleApproved(data.moduleApproved)
                  setCompletedModules(prev => [...new Set([...prev, data.moduleApproved])])
                }

                // Certificado general aprobado
                if (data.approved) {
                  setApproved(true)
                  const { data: cert } = await supabase
                    .from('certificates')
                    .select('*')
                    .eq('user_id', userId)
                    .eq('company_id', profile?.company_id || '')
                    .eq('agent_slug', agentSlug)
                    .maybeSingle()
                  if (cert) setCertificate(cert)
                }
              }
            } catch {}
          }
        }
      }
    } catch (err) {
      setMessages(prev => {
        const updated = [...prev]
        const last = updated[updated.length - 1]
        if (last.streaming) {
          updated[updated.length - 1] = { ...last, content: 'Error al conectar. Intenta de nuevo.', streaming: false }
        }
        return updated
      })
    }
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return
    const userMessage = input.trim()
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }]
    setMessages(newMessages)
    setLoading(true)
    await sendStreamMessage(newMessages, company?.slug, conversationId!, profile?.id)
    setLoading(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); sendMessage() }
  }

  if (initializing) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FA' }}>
      <div className="text-center">
        <div className="flex items-center gap-2 justify-center mb-3">
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3B5BDB', animationDelay: '0ms' }}></div>
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3B5BDB', animationDelay: '150ms' }}></div>
          <div className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#3B5BDB', animationDelay: '300ms' }}></div>
        </div>
        <div className="text-sm font-medium" style={{ color: '#64748B' }}>Preparando tu sesión...</div>
      </div>
    </div>
  )

  const branding = company ? getBranding(agentSlug === 'capacitacion' ? 'vitanova-capacitacion' : company.slug) : getBranding('colegio-montano')
  const isCapacitacion = agentSlug === 'capacitacion'
  const chatTitle = isCapacitacion ? 'Centro de Capacitación' : 'Inducción General'

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F5F7FA' }}>

      {/* Header */}
      <div className="bg-white border-b px-6 h-16 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: '#E8ECF0' }}>
        <div className="flex items-center gap-4">
          <button onClick={() => router.push('/dashboard')}
            className="flex items-center gap-1.5 text-sm font-medium transition-colors hover:opacity-70"
            style={{ color: '#94A3B8' }}>
            ← Dashboard
          </button>
          <div className="w-px h-5" style={{ background: '#E2E8F0' }}></div>
          <div className="w-24 h-10 rounded-xl overflow-hidden bg-white border flex items-center justify-center px-2"
            style={{ borderColor: '#E2E8F0' }}>
            <img src={branding.logoUrl} alt={branding.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <p className="text-sm font-bold" style={{ color: '#0F172A' }}>{chatTitle}</p>
            <p className="text-xs" style={{ color: '#94A3B8' }}>con {branding.agentName}</p>
          </div>
        </div>
        <div className="flex items-center gap-2">
          {isCapacitacion && completedModules.length > 0 && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: '#EEF2FF', color: '#3B5BDB' }}>
              {completedModules.length} módulo{completedModules.length !== 1 ? 's' : ''} completado{completedModules.length !== 1 ? 's' : ''}
            </span>
          )}
          {approved && (
            <span className="text-xs font-semibold px-3 py-1.5 rounded-full"
              style={{ background: '#DCFCE7', color: '#166534' }}>
              ✓ Certificado emitido
            </span>
          )}
          <span className="text-xs px-3 py-1.5 rounded-full font-medium"
            style={{ background: '#F1F5F9', color: '#64748B' }}>
            {messages.filter(m => m.role === 'user').length} respuestas
          </span>
        </div>
      </div>

      {/* Notificación módulo aprobado */}
      {moduleApproved && (
        <div className="fixed top-20 left-1/2 -translate-x-1/2 z-50 px-6 py-4 rounded-2xl shadow-xl flex items-center gap-4"
          style={{ background: 'white', border: '1px solid #BBF7D0', minWidth: 340 }}>
          <div className="w-10 h-10 rounded-xl flex items-center justify-center flex-shrink-0"
            style={{ background: '#DCFCE7' }}>
            <span className="text-xl">🏅</span>
          </div>
          <div className="flex-1">
            <p className="text-sm font-bold" style={{ color: '#0F172A' }}>¡Módulo aprobado!</p>
            <p className="text-xs mt-0.5" style={{ color: '#64748B' }}>{moduleApproved}</p>
          </div>
          <button
            onClick={() => router.push('/certificados')}
            className="text-xs font-bold px-3 py-1.5 rounded-lg flex-shrink-0"
            style={{ background: '#166534', color: 'white' }}>
            Ver certificado
          </button>
          <button onClick={() => setModuleApproved(null)} style={{ color: '#94A3B8' }}>×</button>
        </div>
      )}

      {/* Mensajes */}
      <div className="flex-1 overflow-y-auto py-6" style={{ background: '#F5F7FA' }}>
        <div className="max-w-3xl mx-auto px-4 space-y-4">
          {messages.map((msg, i) => (
            <div key={i} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'} items-end gap-3`}>
              {msg.role === 'assistant' && (
                <div className="w-9 h-9 rounded-xl overflow-hidden bg-white border flex-shrink-0 flex items-center justify-center"
                  style={{ borderColor: '#E2E8F0' }}>
                  <img src={branding.logoUrl} alt="agente"
                    style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 4 }} />
                </div>
              )}
              <div className="max-w-lg">
                <div className="px-4 py-3 rounded-2xl text-sm leading-relaxed"
                  style={{
                    background: msg.role === 'user' ? branding.primaryColor : 'white',
                    color: msg.role === 'user' ? 'white' : '#1A1A2E',
                    border: msg.role === 'assistant' ? '1px solid #E2E8F0' : 'none',
                    borderRadius: msg.role === 'user' ? '20px 20px 4px 20px' : '4px 20px 20px 20px',
                    boxShadow: msg.role === 'assistant' ? '0 1px 3px rgba(0,0,0,0.06)' : 'none'
                  }}>
                  {msg.streaming ? (
                    <span className="inline-flex gap-1 py-1">
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#94A3B8', animationDelay: '0ms' }}></span>
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#94A3B8', animationDelay: '150ms' }}></span>
                      <span className="w-2 h-2 rounded-full animate-bounce" style={{ background: '#94A3B8', animationDelay: '300ms' }}></span>
                    </span>
                  ) : (
                    <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
                  )}
                </div>
              </div>
              {msg.role === 'user' && (
                <div className="w-9 h-9 rounded-xl flex items-center justify-center text-xs font-bold text-white flex-shrink-0"
                  style={{ background: branding.primaryColor }}>
                  {profile?.full_name?.charAt(0) || 'U'}
                </div>
              )}
            </div>
          ))}

          {/* Banner certificado general */}
          {approved && certificate && (
            <div className="rounded-2xl p-6 text-center mt-4"
              style={{ background: `linear-gradient(135deg, ${branding.bgColor}, ${branding.primaryColor})` }}>
              <div className="text-4xl mb-3">🏆</div>
              <h3 className="text-white font-bold text-lg mb-1">¡Felicidades!</h3>
              <p className="text-sm mb-5" style={{ color: 'rgba(255,255,255,0.75)' }}>
                Completaste exitosamente tu {isCapacitacion ? 'capacitación' : 'inducción'}
              </p>
              <div className="flex gap-3 justify-center">
                <button onClick={() => window.open(`/api/certificate-pdf?id=${certificate.id}`, '_blank')}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold transition-all"
                  style={{ background: branding.secondaryColor, color: branding.bgColor }}>
                  ↓ Descargar certificado
                </button>
                <button onClick={() => router.push('/certificados')}
                  className="px-5 py-2.5 rounded-xl text-sm font-bold text-white border transition-all"
                  style={{ borderColor: 'rgba(255,255,255,0.3)' }}>
                  Ver todos mis certificados
                </button>
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>
      </div>

      {/* Input */}
      <div className="bg-white border-t px-4 py-4" style={{ borderColor: '#E2E8F0' }}>
        <div className="max-w-3xl mx-auto">
          <div className="flex gap-3 items-end">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder={loading ? 'El agente está respondiendo...' : 'Escribe tu respuesta...'}
              rows={1}
              disabled={loading}
              className="flex-1 border rounded-2xl px-4 py-3 text-sm outline-none resize-none transition-all"
              style={{
                borderColor: '#E2E8F0',
                color: '#0F172A',
                background: loading ? '#F8FAFC' : 'white',
                maxHeight: 120
              }}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="px-5 py-3 rounded-2xl text-sm font-bold text-white transition-all flex-shrink-0"
              style={{ background: loading || !input.trim() ? '#E2E8F0' : branding.primaryColor,
                color: loading || !input.trim() ? '#94A3B8' : 'white' }}>
              {loading ? '...' : '↑'}
            </button>
          </div>
          <p className="text-center text-xs mt-2" style={{ color: '#CBD5E1' }}>
            Enter para enviar · Tu progreso se guarda automáticamente
          </p>
        </div>
      </div>
    </div>
  )
}

export default function InduccionPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen flex items-center justify-center" style={{ background: '#F5F7FA' }}>
        <div className="text-sm font-medium" style={{ color: '#64748B' }}>Cargando...</div>
      </div>
    }>
      <InduccionContent />
    </Suspense>
  )
}

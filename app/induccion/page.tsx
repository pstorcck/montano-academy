'use client'

import { useEffect, useState, useRef } from 'react'
import { supabase } from '@/lib/supabase'
import { getBranding } from '@/lib/branding'
import { useRouter } from 'next/navigation'

type Message = {
  role: 'user' | 'assistant'
  content: string
}

export default function InduccionPage() {
  const router = useRouter()
  const [profile, setProfile] = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [messages, setMessages] = useState<Message[]>([])
  const [input, setInput] = useState('')
  const [loading, setLoading] = useState(false)
  const [conversationId, setConversationId] = useState<string | null>(null)
  const [approved, setApproved] = useState(false)
  const [certificate, setCertificate] = useState<any>(null)
  const [initializing, setInitializing] = useState(true)
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

      // Buscar conversación existente activa
      const { data: existingConv } = await supabase
        .from('conversations')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', profileData.company_id)
        .order('started_at', { ascending: false })
        .limit(1)
        .single()

      // Verificar si ya tiene certificado
      const { data: cert } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', user.id)
        .eq('company_id', profileData.company_id)
        .single()

      if (cert) {
        setCertificate(cert)
        setApproved(true)
      }

      if (existingConv && existingConv.status !== 'completed') {
        // Continuar conversación existente
        setConversationId(existingConv.id)

        // Cargar mensajes anteriores
        const { data: prevMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', existingConv.id)
          .order('created_at', { ascending: true })

        if (prevMessages && prevMessages.length > 0) {
          setMessages(prevMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })))
          setInitializing(false)
        } else {
          // Conversación existe pero sin mensajes — enviar saludo inicial
          await sendInitialMessage(profileData.companies.slug, existingConv.id, user.id)
          setInitializing(false)
        }
      } else if (existingConv && existingConv.status === 'completed') {
        // Curso completado — cargar mensajes solo para ver
        setConversationId(existingConv.id)
        const { data: prevMessages } = await supabase
          .from('messages')
          .select('*')
          .eq('conversation_id', existingConv.id)
          .order('created_at', { ascending: true })

        if (prevMessages) {
          setMessages(prevMessages.map(m => ({
            role: m.role as 'user' | 'assistant',
            content: m.content
          })))
        }
        setInitializing(false)
      } else {
        // Primera vez — crear conversación nueva
        const { data: newConv } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            company_id: profileData.company_id,
            status: 'active'
          })
          .select()
          .single()

        if (newConv) {
          setConversationId(newConv.id)
          await sendInitialMessage(profileData.companies.slug, newConv.id, user.id)
        }
        setInitializing(false)
      }
    }
    init()
  }, [router])

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [messages])

  const sendInitialMessage = async (slug: string, convId: string, userId: string) => {
    setLoading(true)
    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: [{ role: 'user', content: 'Hola, estoy listo para comenzar mi inducción.' }],
        company_slug: slug,
        conversation_id: convId,
        user_id: userId,
      })
    })
    const data = await res.json()
    if (data.message) {
      setMessages([
        { role: 'user', content: 'Hola, estoy listo para comenzar mi inducción.' },
        { role: 'assistant', content: data.message }
      ])
    }
    setLoading(false)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading || approved) return

    const userMessage = input.trim()
    setInput('')
    const newMessages: Message[] = [...messages, { role: 'user', content: userMessage }]
    setMessages(newMessages)
    setLoading(true)

    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: newMessages,
        company_slug: company?.slug,
        conversation_id: conversationId,
        user_id: profile?.id,
      })
    })

    const data = await res.json()

    if (data.message) {
      setMessages([...newMessages, { role: 'assistant', content: data.message }])
    }

    if (data.approved && data.certificate) {
      setApproved(true)
      // Buscar el certificado en DB
      const { data: cert } = await supabase
        .from('certificates')
        .select('*')
        .eq('user_id', profile?.id)
        .eq('company_id', company?.id)
        .single()
      setCertificate(cert)
    }

    setLoading(false)
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      sendMessage()
    }
  }

  const handleDownloadCert = () => {
    if (certificate) {
      window.open(`/api/certificate-pdf?id=${certificate.id}`, '_blank')
    }
  }

  if (initializing) return (
    <div className="min-h-screen flex items-center justify-center" style={{ background: '#0A0E1A' }}>
      <div className="text-center">
        <div className="text-white text-sm mb-2">Cargando tu inducción...</div>
        <div className="text-xs" style={{ color: 'rgba(255,255,255,0.3)' }}>Preparando el agente</div>
      </div>
    </div>
  )

  const branding = company ? getBranding(company.slug) : getBranding('colegio-montano')

  return (
    <div className="min-h-screen flex flex-col" style={{ background: '#F8F7F4' }}>

      {/* Topbar */}
      <div className="bg-white border-b px-6 h-14 flex items-center justify-between sticky top-0 z-10"
        style={{ borderColor: '#E8E8E0' }}>
        <div className="flex items-center gap-3">
          <button onClick={() => router.push('/dashboard')}
            className="text-sm cursor-pointer" style={{ color: '#9A9AAA' }}>
            ← Dashboard
          </button>
          <div className="w-px h-4" style={{ background: '#E8E8E0' }}></div>
          <div className="w-7 h-7 rounded-lg overflow-hidden bg-white border flex items-center justify-center"
            style={{ borderColor: '#E8E8E0' }}>
            <img src={branding.logoUrl} alt={branding.name}
              style={{ width: '100%', height: '100%', objectFit: 'contain' }} />
          </div>
          <div>
            <span className="text-sm font-semibold" style={{ color: '#1A1A2E' }}>
              Inducción General
            </span>
            <span className="text-xs ml-2" style={{ color: '#9A9AAA' }}>
              con {branding.agentName}
            </span>
          </div>
        </div>
        <div className="flex items-center gap-3">
          {approved && (
            <span className="text-xs font-semibold px-3 py-1 rounded-full"
              style={{ background: '#DCFCE7', color: '#166534' }}>
              Completado
            </span>
          )}
          <span className="text-xs px-3 py-1 rounded-full font-semibold"
            style={{ background: '#F3F4F6', color: '#6B7280' }}>
            {messages.filter(m => m.role === 'user').length} respuestas
          </span>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 overflow-y-auto px-4 py-6 max-w-3xl mx-auto w-full">
        {messages.map((msg, i) => (
          <div key={i} className={`flex mb-4 ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            {msg.role === 'assistant' && (
              <div className="w-8 h-8 rounded-full flex items-center justify-center text-xs font-bold text-white mr-3 flex-shrink-0 mt-1 overflow-hidden"
                style={{ background: branding.bgColor }}>
                <img src={branding.logoUrl} alt="agente"
                  style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} />
              </div>
            )}
            <div className={`max-w-lg px-4 py-3 rounded-2xl text-sm leading-relaxed`}
              style={{
                background: msg.role === 'user' ? branding.primaryColor : 'white',
                color: msg.role === 'user' ? 'white' : '#1A1A2E',
                border: msg.role === 'assistant' ? '1px solid #E8E8E0' : 'none',
                borderRadius: msg.role === 'user' ? '18px 18px 4px 18px' : '18px 18px 18px 4px'
              }}>
              <p style={{ whiteSpace: 'pre-wrap' }}>{msg.content}</p>
            </div>
          </div>
        ))}

        {loading && (
          <div className="flex mb-4 justify-start">
            <div className="w-8 h-8 rounded-full flex items-center justify-center mr-3 flex-shrink-0 overflow-hidden"
              style={{ background: branding.bgColor }}>
              <img src={branding.logoUrl} alt="agente"
                style={{ width: '100%', height: '100%', objectFit: 'contain', padding: 2 }} />
            </div>
            <div className="px-4 py-3 rounded-2xl bg-white border" style={{ borderColor: '#E8E8E0' }}>
              <div className="flex gap-1">
                {[0,1,2].map(i => (
                  <div key={i} className="w-2 h-2 rounded-full animate-bounce"
                    style={{ background: '#D1D5DB', animationDelay: `${i * 0.15}s` }}></div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* Banner certificado */}
        {approved && certificate && (
          <div className="rounded-2xl p-6 text-center mb-4"
            style={{ background: `linear-gradient(135deg, ${branding.bgColor}, ${branding.primaryColor})` }}>
            <div className="text-3xl mb-2">🏆</div>
            <h3 className="text-white font-bold text-lg mb-1">¡Felicidades!</h3>
            <p className="text-sm mb-4" style={{ color: 'rgba(255,255,255,0.7)' }}>
              Completaste tu inducción exitosamente
            </p>
            <div className="flex gap-3 justify-center">
              <button onClick={handleDownloadCert}
                className="px-5 py-2 rounded-xl text-sm font-bold"
                style={{ background: branding.secondaryColor, color: branding.bgColor }}>
                Descargar certificado
              </button>
              <button onClick={() => router.push('/certificados')}
                className="px-5 py-2 rounded-xl text-sm font-bold text-white border"
                style={{ borderColor: 'rgba(255,255,255,0.3)' }}>
                Ver certificado
              </button>
            </div>
          </div>
        )}

        <div ref={messagesEndRef} />
      </div>

      {/* Input */}
      {!approved && (
        <div className="bg-white border-t px-4 py-4" style={{ borderColor: '#E8E8E0' }}>
          <div className="max-w-3xl mx-auto flex gap-3">
            <textarea
              value={input}
              onChange={e => setInput(e.target.value)}
              onKeyDown={handleKeyPress}
              placeholder="Escribe tu respuesta..."
              rows={1}
              className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none resize-none"
              style={{ borderColor: '#E8E8E0', color: '#1A1A2E' }}
            />
            <button onClick={sendMessage} disabled={loading || !input.trim()}
              className="px-5 py-3 rounded-xl text-sm font-bold text-white transition-all"
              style={{ background: loading || !input.trim() ? '#D1D5DB' : branding.primaryColor }}>
              Enviar
            </button>
          </div>
          <p className="text-center text-xs mt-2" style={{ color: '#9A9AAA' }}>
            Enter para enviar · Tu progreso se guarda automáticamente
          </p>
        </div>
      )}

      {approved && (
        <div className="bg-white border-t px-4 py-4 text-center" style={{ borderColor: '#E8E8E0' }}>
          <p className="text-sm font-semibold" style={{ color: '#166534' }}>
            Inducción completada — Tu certificado ha sido emitido
          </p>
        </div>
      )}
    </div>
  )
}

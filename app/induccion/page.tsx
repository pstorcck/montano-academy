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

      if (profileData) {
        setProfile(profileData)
        setCompany(profileData.companies)

        // Crear conversación
        const { data: conv } = await supabase
          .from('conversations')
          .insert({
            user_id: user.id,
            company_id: profileData.company_id,
            status: 'active'
          })
          .select()
          .single()

        if (conv) setConversationId(conv.id)

        // Mensaje inicial del agente
        await sendInitialMessage(profileData.companies.slug, conv?.id, user.id)
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
    setMessages([
      { role: 'user', content: 'Hola, estoy listo para comenzar mi inducción.' },
      { role: 'assistant', content: data.message }
    ])
    setLoading(false)
  }

  const sendMessage = async () => {
    if (!input.trim() || loading) return

    const { data: { user } } = await supabase.auth.getUser()
    const newMessages: Message[] = [...messages, { role: 'user', content: input }]
    setMessages(newMessages)
    setInput('')
    setLoading(true)

    const res = await fetch('/api/agent', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: newMessages,
        company_slug: company?.slug,
        conversation_id: conversationId,
        user_id: user?.id,
      })
    })

    const data = await res.json()

    setMessages([...newMessages, { role: 'assistant', content: data.message }])

    if (data.approved) {
      setApproved(true)
      setCertificate(data.certificate)
    }

    setLoading(false)
  }

  const branding = company ? getBranding(company.slug) : getBranding('colegio-montano')

  if (approved && certificate) {
    return (
      <div className="min-h-screen flex flex-col items-center justify-center p-8"
        style={{ background: '#EEECEA' }}>
        <div className="text-center mb-6">
          <div className="text-4xl mb-3">🎉</div>
          <h2 className="text-2xl font-bold" style={{ color: '#1A1A2E' }}>
            ¡Felicidades, {profile?.full_name?.split(' ')[0]}!
          </h2>
          <p className="text-sm mt-2" style={{ color: '#7A7A8A' }}>
            Completaste tu inducción con {certificate.score}% de punteo
          </p>
        </div>

        {/* Certificado */}
        <div className="bg-white shadow-2xl overflow-hidden" style={{ width: 640 }}>
          <div className="h-2" style={{ background: branding.bgColor }}></div>
          <div className="h-1" style={{ background: `linear-gradient(90deg, ${branding.secondaryColor}, ${branding.primaryColor})` }}></div>
          <div className="p-12 text-center">
            <div className="w-14 h-14 rounded-full flex items-center justify-center mx-auto mb-4 border-4"
              style={{ background: branding.bgColor, borderColor: branding.secondaryColor }}>
              <span className="text-sm font-black" style={{ color: branding.secondaryColor }}>
                {branding.logoInitials}
              </span>
            </div>
            <p className="text-xs font-bold uppercase tracking-widest mb-2" style={{ color: '#9A9AAA' }}>
              Grupo Montano · montano.academy
            </p>
            <h1 className="text-3xl font-black mb-1" style={{ color: branding.bgColor }}>
              Certificado de Finalización
            </h1>
            <p className="text-xs tracking-widest mb-6" style={{ color: '#9A9AAA' }}>
              Programa de Inducción Institucional · {new Date().getFullYear()}
            </p>
            <div className="w-12 h-0.5 mx-auto mb-6"
              style={{ background: `linear-gradient(90deg, ${branding.primaryColor}, ${branding.secondaryColor})` }}>
            </div>
            <p className="text-sm mb-2" style={{ color: '#9A9AAA' }}>Este certificado acredita que</p>
            <p className="text-3xl font-black mb-1 pb-3 inline-block border-b-2"
              style={{ color: branding.bgColor, borderColor: '#E8E8E0', minWidth: 280 }}>
              {profile?.full_name}
            </p>
            <p className="text-sm mt-4 mb-1" style={{ color: '#9A9AAA' }}>
              ha completado satisfactoriamente
            </p>
            <p className="text-lg font-bold mb-6" style={{ color: branding.bgColor }}>
              {certificate.course}
            </p>
            <div className="flex justify-center gap-10 pt-4 border-t" style={{ borderColor: '#F0F0F0' }}>
              <div>
                <p className="font-bold text-sm" style={{ color: branding.bgColor }}>
                  {new Date().toLocaleDateString('es-GT', { year: 'numeric', month: 'long', day: 'numeric' })}
                </p>
                <p className="text-xs uppercase tracking-wide mt-1" style={{ color: '#9A9AAA' }}>Fecha de emisión</p>
              </div>
              <div>
                <p className="font-bold text-sm" style={{ color: branding.bgColor }}>
                  {certificate.number}
                </p>
                <p className="text-xs uppercase tracking-wide mt-1" style={{ color: '#9A9AAA' }}>Número de certificado</p>
              </div>
              <div>
                <span className="font-black text-sm px-3 py-1 rounded-full"
                  style={{ background: branding.bgColor, color: branding.secondaryColor }}>
                  {certificate.score}/100
                </span>
                <p className="text-xs uppercase tracking-wide mt-1" style={{ color: '#9A9AAA' }}>Punteo final</p>
              </div>
            </div>
          </div>
          <div className="h-2" style={{ background: `linear-gradient(90deg, ${branding.bgColor}, ${branding.primaryColor})` }}></div>
        </div>

        <div className="flex gap-3 mt-6">
          <button className="px-6 py-3 rounded-xl font-bold text-sm"
            style={{ background: branding.bgColor, color: 'white' }}
            onClick={() => window.print()}>
            ⬇ Descargar PDF
          </button>
          <button className="px-6 py-3 rounded-xl font-bold text-sm border"
            style={{ borderColor: '#E8E8E0', color: '#2D2D2D' }}
            onClick={() => router.push('/dashboard')}>
            Volver al dashboard
          </button>
        </div>
      </div>
    )
  }

  return (
    <div className="min-h-screen flex" style={{ background: '#F8F7F4' }}>

      {/* Sidebar */}
      <div className="w-60 min-h-screen flex flex-col" style={{ background: branding.bgColor }}>
        <div className="p-5 border-b" style={{ borderColor: 'rgba(255,255,255,0.08)' }}>
          <button onClick={() => router.push('/dashboard')}
            className="text-xs mb-3 flex items-center gap-1 cursor-pointer"
            style={{ color: 'rgba(255,255,255,0.4)' }}>
            ← Volver al dashboard
          </button>
          <p className="text-white text-sm font-bold">{branding.agentName}</p>
          <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
            Inducción {branding.name}
          </p>
        </div>

        <div className="p-4 flex-1">
          <p className="text-xs font-bold uppercase tracking-widest mb-3"
            style={{ color: 'rgba(255,255,255,0.25)' }}>
            Estado
          </p>
          <div className="flex items-center gap-2 px-3 py-2 rounded-lg"
            style={{ background: `${branding.secondaryColor}18`, color: branding.secondaryColor }}>
            <span className="text-xs">▶</span>
            <span className="text-xs font-semibold">En progreso</span>
          </div>
        </div>

        <div className="p-4 border-t" style={{ borderColor: 'rgba(255,255,255,0.07)' }}>
          <div className="flex items-center gap-2">
            <div className="w-7 h-7 rounded-full flex items-center justify-center text-xs font-bold text-white"
              style={{ background: branding.primaryColor }}>
              {profile?.full_name?.charAt(0)}
            </div>
            <div>
              <p className="text-xs font-semibold text-white">{profile?.full_name}</p>
              <p className="text-xs" style={{ color: 'rgba(255,255,255,0.35)' }}>Colaborador</p>
            </div>
          </div>
        </div>
      </div>

      {/* Chat */}
      <div className="flex-1 flex flex-col">

        {/* Topbar */}
        <div className="border-b px-8 h-14 flex items-center justify-between"
          style={{ background: branding.bgColor, borderColor: 'rgba(255,255,255,0.1)' }}>
          <div>
            <p className="text-sm font-bold text-white">{branding.agentName}</p>
            <p className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>
              Inducción activa · En vivo
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="w-2 h-2 rounded-full" style={{ background: '#4CAF50' }}></div>
            <span className="text-xs" style={{ color: 'rgba(255,255,255,0.4)' }}>Conectado</span>
          </div>
        </div>

        {/* Messages */}
        <div className="flex-1 overflow-y-auto p-8 flex flex-col gap-4 max-w-3xl mx-auto w-full">
          {messages.map((msg, i) => (
            <div key={i} className={`flex gap-3 ${msg.role === 'user' ? 'flex-row-reverse' : ''}`}>

              {/* Avatar */}
              <div className="w-9 h-9 rounded-full flex items-center justify-center flex-shrink-0 text-base"
                style={{
                  background: msg.role === 'assistant'
                    ? `linear-gradient(135deg, ${branding.primaryColor}, ${branding.bgColor})`
                    : '#6B7280',
                  border: msg.role === 'assistant' ? `2px solid ${branding.secondaryColor}` : 'none'
                }}>
                {msg.role === 'assistant' ? '🤖' : profile?.full_name?.charAt(0)}
              </div>

              {/* Bubble */}
              <div className="max-w-lg">
                <p className={`text-xs font-bold mb-1 ${msg.role === 'user' ? 'text-right' : ''}`}
                  style={{ color: '#9A9AAA' }}>
                  {msg.role === 'assistant' ? branding.agentName.toUpperCase() : profile?.full_name?.toUpperCase()}
                </p>
                <div className="px-4 py-3 rounded-2xl text-sm leading-relaxed whitespace-pre-wrap"
                  style={{
                    background: msg.role === 'assistant' ? 'white' : branding.bgColor,
                    color: msg.role === 'assistant' ? '#2D2D2D' : 'white',
                    borderRadius: msg.role === 'assistant' ? '4px 16px 16px 16px' : '16px 4px 16px 16px',
                    border: msg.role === 'assistant' ? '1px solid #E8E8E0' : 'none',
                  }}>
                  {msg.role === 'assistant'
                    ? msg.content.replace(/CERTIFICADO_APROBADO[\s\S]*/g, '').trim()
                    : msg.content}
                </div>
              </div>
            </div>
          ))}

          {loading && (
            <div className="flex gap-3">
              <div className="w-9 h-9 rounded-full flex items-center justify-center text-base"
                style={{ background: `linear-gradient(135deg, ${branding.primaryColor}, ${branding.bgColor})`,
                  border: `2px solid ${branding.secondaryColor}` }}>
                🤖
              </div>
              <div className="px-4 py-3 rounded-2xl bg-white border text-sm"
                style={{ borderColor: '#E8E8E0', color: '#9A9AAA' }}>
                {branding.agentName} está escribiendo...
              </div>
            </div>
          )}

          <div ref={messagesEndRef} />
        </div>

        {/* Input */}
        <div className="border-t bg-white px-8 py-4"
          style={{ borderColor: '#E8E8E0' }}>
          <div className="flex gap-3 max-w-3xl mx-auto">
            <input
              type="text"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => e.key === 'Enter' && sendMessage()}
              placeholder="Escribe tu respuesta..."
              className="flex-1 border rounded-xl px-4 py-3 text-sm outline-none transition-all"
              style={{ borderColor: '#E8E8E0', color: '#2D2D2D' }}
              disabled={loading}
            />
            <button
              onClick={sendMessage}
              disabled={loading || !input.trim()}
              className="rounded-xl w-12 h-12 flex items-center justify-center text-white font-bold transition-all"
              style={{ background: branding.bgColor }}>
              ➤
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}

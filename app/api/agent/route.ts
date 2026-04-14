import OpenAI from 'openai'
import { createClient } from '@supabase/supabase-js'
import { NextRequest, NextResponse } from 'next/server'

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY })

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_ROLE_KEY!
)

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { messages, company_slug, conversation_id, user_id } = body
    console.log('Request recibido:', { company_slug, conversation_id, user_id, messagesCount: messages?.length })

    // Obtener empresa
    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', company_slug)
      .single()

    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    // Obtener configuración del agente
    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('company_id', company.id)
      .single()

    if (!agentConfig?.openai_assistant_id) {
      return NextResponse.json({ error: 'Assistant no configurado' }, { status: 404 })
    }

    // Obtener o crear thread para esta conversación
    let threadId: string

    const { data: convData } = await supabase
      .from('conversations')
      .select('openai_thread_id')
      .eq('id', conversation_id)
      .single()

    if (convData?.openai_thread_id) {
      threadId = convData.openai_thread_id
    } else {
      const thread = await openai.beta.threads.create()
      threadId = thread.id
      console.log('Thread creado:', threadId, 'para conversacion:', conversation_id)
      // Intentar update directo con SQL
      const { error: threadUpdateError } = await supabase
        .rpc('set_thread_id', { 
          conv_id: conversation_id, 
          thread_id: threadId 
        })
      console.log('Thread update result:', threadUpdateError ? threadUpdateError.message : 'OK')
    }

    // Agregar el último mensaje del usuario al thread
    const lastUserMessage = messages[messages.length - 1]
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: lastUserMessage.content,
    })

    // Ejecutar el assistant
    const run = await openai.beta.threads.runs.createAndPoll(threadId, {
      assistant_id: agentConfig.openai_assistant_id,
    })

    if (run.status !== 'completed') {
      return NextResponse.json({ error: `Run failed: ${run.status}` }, { status: 500 })
    }

    // Obtener la respuesta
    const threadMessages = await openai.beta.threads.messages.list(threadId, { limit: 1 })
    const lastMessage = threadMessages.data[0]
    const assistantMessage = lastMessage.content
      .filter((c: any) => c.type === 'text')
      .map((c: any) => c.text.value)
      .join('\n')
      .replace(/【.*?】/g, '') // Eliminar referencias de File Search
      .trim()

    // Guardar en Supabase
    if (conversation_id) {
      await supabase.from('messages').insert([
        { conversation_id, role: 'user', content: lastUserMessage.content },
        { conversation_id, role: 'assistant', content: assistantMessage }
      ])
      await supabase
        .from('conversations')
        .update({ status: 'active', updated_at: new Date().toISOString() })
        .eq('id', conversation_id)
    }

    // Detectar aprobación
    const approved = assistantMessage.includes('CERTIFICADO_APROBADO')

    if (approved && conversation_id) {
      const scoreMatch = assistantMessage.match(/punteo:\s*(\d+)/i)
      const score = scoreMatch ? parseInt(scoreMatch[1]) : 85
      const year = new Date().getFullYear()
      const certNumber = `MA-${company_slug.toUpperCase().slice(0,2)}-${year}-${Math.floor(Math.random() * 900) + 100}`

      await supabase.from('certificates').insert({
        user_id,
        company_id: company.id,
        conversation_id,
        certificate_number: certNumber,
        score,
      })

      await supabase
        .from('conversations')
        .update({ status: 'completed', score, completed_at: new Date().toISOString() })
        .eq('id', conversation_id)

      return NextResponse.json({
        message: assistantMessage,
        approved: true,
        certificate: { number: certNumber, score }
      })
    }

    return NextResponse.json({ message: assistantMessage, approved: false })

  } catch (error: any) {
    console.error('Error agente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

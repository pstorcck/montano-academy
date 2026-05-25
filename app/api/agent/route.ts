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

    const { data: company } = await supabase
      .from('companies')
      .select('id')
      .eq('slug', company_slug)
      .single()

    if (!company) return NextResponse.json({ error: 'Empresa no encontrada' }, { status: 404 })

    const { data: agentConfig } = await supabase
      .from('agent_configs')
      .select('*')
      .eq('company_id', company.id)
      .single()

    if (!agentConfig?.openai_assistant_id) {
      return NextResponse.json({ error: 'Assistant no configurado' }, { status: 404 })
    }

    // Obtener módulos completados
    const { data: completedModules } = await supabase
      .from('module_progress')
      .select('module_name, score')
      .eq('user_id', user_id)
      .eq('company_id', company.id)

    const completedModuleNames = (completedModules || []).map(m => m.module_name)

    // Obtener o crear thread
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
      const { error: threadUpdateError } = await supabase
        .rpc('set_thread_id', { conv_id: conversation_id, thread_id: threadId })
      console.log('Thread update result:', threadUpdateError ? threadUpdateError.message : 'OK')
    }

    // Agregar mensaje del usuario
    const lastUserMessage = messages[messages.length - 1]
    await openai.beta.threads.messages.create(threadId, {
      role: 'user',
      content: lastUserMessage.content,
    })

    // Streaming
    const encoder = new TextEncoder()
    let fullMessage = ''

    const stream = new ReadableStream({
      async start(controller) {
        try {
          const streamRun = openai.beta.threads.runs.stream(threadId, {
            assistant_id: agentConfig.openai_assistant_id,
          })

          for await (const event of streamRun) {
            if (event.event === 'thread.message.delta') {
              const delta = event.data.delta
              if (delta.content) {
                for (const block of delta.content) {
                  if (block.type === 'text' && block.text?.value) {
                    const chunk = block.text.value
                    fullMessage += chunk
                    controller.enqueue(encoder.encode(`data: ${JSON.stringify({ chunk })}\n\n`))
                  }
                }
              }
            }

            if (event.event === 'thread.run.completed') {
              fullMessage = fullMessage.replace(/【.*?】/g, '').trim()

              // Guardar mensajes
              if (conversation_id) {
                await supabase.from('messages').insert([
                  { conversation_id, role: 'user', content: lastUserMessage.content },
                  { conversation_id, role: 'assistant', content: fullMessage }
                ])
                await supabase
                  .from('conversations')
                  .update({ status: 'active', updated_at: new Date().toISOString() })
                  .eq('id', conversation_id)
              }

              // Detectar módulo aprobado
              const moduleMatch = fullMessage.match(/MODULO_APROBADO[\s\S]*?modulo:\s*(.+?)[\n\r]/i)
              const modulePunteoMatch = fullMessage.match(/MODULO_APROBADO[\s\S]*?punteo:\s*(\d+)/i)

              if (moduleMatch && conversation_id) {
                const moduleName = moduleMatch[1].trim()
                const moduleScore = modulePunteoMatch ? parseInt(modulePunteoMatch[1]) : 85

                // Guardar módulo completado
                await supabase.from('module_progress').upsert({
                  user_id,
                  company_id: company.id,
                  module_name: moduleName,
                  score: moduleScore,
                  conversation_id,
                }, { onConflict: 'user_id,company_id,module_name' })

                // Verificar si completó todos los módulos
                const requiredModules: string[] = agentConfig.required_modules || []
                const newCompleted = [...completedModuleNames, moduleName]

                // Para MAC verificar módulo de unidad de negocio dinámicamente
                let allComplete = false
                if (company_slug === 'mac') {
                  const hasGeneral = newCompleted.some(m => m.includes('Conocimiento General'))
                  const hasUnit = newCompleted.some(m => 
                    m.includes('Montano Café') || m.includes('PPT') || 
                    m.includes('MAC OS') || m.includes('Inmobiliaria') ||
                    m.includes('Piedra Papel') || m.includes('Tecnoparque')
                  )
                  allComplete = hasGeneral && hasUnit
                } else {
                  allComplete = requiredModules.length > 0 && 
                    requiredModules.every(m => newCompleted.some(c => 
                      c.toLowerCase().includes(m.toLowerCase()) || 
                      m.toLowerCase().includes(c.toLowerCase())
                    ))
                }

                if (allComplete) {
                  // Emitir certificado general
                  const avgScore = Math.round(
                    [...(completedModules || []), { score: moduleScore }]
                      .reduce((sum, m) => sum + m.score, 0) / 
                    (completedModuleNames.length + 1)
                  )

                  const year = new Date().getFullYear()
                  const certNumber = `MA-${company_slug.toUpperCase().slice(0,2)}-${year}-${Math.floor(Math.random() * 900) + 100}`

                  await supabase.from('certificates').upsert({
                    user_id,
                    company_id: company.id,
                    conversation_id,
                    certificate_number: certNumber,
                    score: avgScore,
                  }, { onConflict: 'user_id,company_id' })

                  await supabase
                    .from('conversations')
                    .update({ status: 'completed', score: avgScore, completed_at: new Date().toISOString() })
                    .eq('id', conversation_id)

                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    done: true, 
                    moduleApproved: moduleName,
                    approved: true, 
                    certificate: { number: certNumber, score: avgScore },
                    completedModules: newCompleted
                  })}\n\n`))
                } else {
                  controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                    done: true, 
                    moduleApproved: moduleName,
                    approved: false,
                    completedModules: newCompleted
                  })}\n\n`))
                }

              } else if (fullMessage.includes('CERTIFICADO_APROBADO')) {
                // Fallback — certificado directo (no debería pasar con prompts actualizados)
                const scoreMatch = fullMessage.match(/punteo:\s*(\d+)/i)
                const score = scoreMatch ? parseInt(scoreMatch[1]) : 85
                const year = new Date().getFullYear()
                const certNumber = `MA-${company_slug.toUpperCase().slice(0,2)}-${year}-${Math.floor(Math.random() * 900) + 100}`

                await supabase.from('certificates').upsert({
                  user_id,
                  company_id: company.id,
                  conversation_id,
                  certificate_number: certNumber,
                  score,
                }, { onConflict: 'user_id,company_id' })

                await supabase
                  .from('conversations')
                  .update({ status: 'completed', score, completed_at: new Date().toISOString() })
                  .eq('id', conversation_id)

                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ 
                  done: true, 
                  approved: true,
                  certificate: { number: certNumber, score }
                })}\n\n`))
              } else {
                controller.enqueue(encoder.encode(`data: ${JSON.stringify({ done: true, approved: false })}\n\n`))
              }

              controller.close()
            }

            if (event.event === 'thread.run.failed') {
              controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: 'Run failed' })}\n\n`))
              controller.close()
            }
          }
        } catch (err: any) {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify({ error: err.message })}\n\n`))
          controller.close()
        }
      }
    })

    return new NextResponse(stream, {
      headers: {
        'Content-Type': 'text/event-stream',
        'Cache-Control': 'no-cache',
        'Connection': 'keep-alive',
      }
    })

  } catch (error: any) {
    console.error('Error agente:', error)
    return NextResponse.json({ error: error.message }, { status: 500 })
  }
}

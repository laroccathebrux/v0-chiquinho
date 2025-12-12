import { type NextRequest, NextResponse } from "next/server"
import OpenAI from "openai"

interface BatchData {
  batchNumber: string
  batchWeight: string
  numberOfBales: string
  micMin: number
  micAvg: number
  micMax: number
  uhmMin: number
  uhmAvg: number
  uhmMax: number
  strMin: number
  strAvg: number
  strMax: number
  sciAvg: number | null
  sourceFile: string
  producerName: string | null
  processedAt?: string
}

// Create context about the data for the AI
function createDataContext(data: { files: unknown[]; summaries: unknown[]; allBatches: BatchData[] }): string {
  const { allBatches } = data

  if (allBatches.length === 0) {
    return "Não há dados de algodão armazenados no momento."
  }

  // Group by producer name (if available) or source file
  const byProducer: Record<string, BatchData[]> = {}
  for (const batch of allBatches) {
    const producer = batch.producerName || batch.sourceFile || "Desconhecido"
    if (!byProducer[producer]) {
      byProducer[producer] = []
    }
    byProducer[producer].push(batch)
  }

  // Calculate statistics per producer
  let context = `Dados de qualidade de algodão disponíveis:\n\n`
  context += `Total de lotes: ${allBatches.length}\n`
  context += `Produtores/Arquivos: ${Object.keys(byProducer).length}\n\n`

  for (const [producer, batches] of Object.entries(byProducer)) {
    context += `\n--- ${producer} ---\n`
    context += `Lotes: ${batches.length}\n`

    // Calculate averages for this producer
    const validSci = batches.filter((b) => b.sciAvg !== null && b.sciAvg > 0)
    const avgSci = validSci.length > 0 ? validSci.reduce((sum, b) => sum + (b.sciAvg || 0), 0) / validSci.length : null

    const avgMic = batches.reduce((sum, b) => sum + b.micAvg, 0) / batches.length
    const avgStr = batches.reduce((sum, b) => sum + b.strAvg, 0) / batches.length
    const avgUhm = batches.reduce((sum, b) => sum + b.uhmAvg, 0) / batches.length

    context += `Mic médio: ${avgMic.toFixed(2)}\n`
    context += `UHM médio: ${avgUhm.toFixed(3)} polegadas\n`
    context += `Resistência média: ${avgStr.toFixed(1)} gf/tex\n`
    if (avgSci !== null) {
      context += `SCI médio: ${avgSci.toFixed(1)}\n`
    }

    // List individual batches
    context += `Detalhes dos lotes:\n`
    for (const batch of batches) {
      context += `  - Lote ${batch.batchNumber}: Mic=${batch.micAvg.toFixed(2)}, UHM=${batch.uhmAvg.toFixed(3)}, STR=${batch.strAvg.toFixed(1)}`
      if (batch.sciAvg !== null && batch.sciAvg > 0) {
        context += `, SCI=${batch.sciAvg.toFixed(1)}`
      }
      context += `, Peso=${batch.batchWeight}kg, Fardos=${batch.numberOfBales}\n`
    }
  }

  return context
}

interface ChatMessage {
  role: "user" | "assistant"
  content: string
}

export async function POST(request: NextRequest) {
  try {
    const { message, generateChart, history, batchData } = await request.json()

    if (!message) {
      return NextResponse.json({ error: "Message is required" }, { status: 400 })
    }

    // Initialize OpenAI client at runtime
    const openai = new OpenAI({
      apiKey: process.env.OPENAI_API_KEY,
    })

    // Use batch data from frontend (passed from localStorage/state)
    const allBatches: BatchData[] = batchData || []
    const storedData = { files: [], summaries: [], allBatches }
    const dataContext = createDataContext(storedData)

    // System prompt for the AI
    const systemPrompt = `Você é um assistente especializado em análise de qualidade de algodão.
Você tem acesso aos dados de classificação HVI (High Volume Instrument) de fardos de algodão.

Os principais parâmetros de qualidade são:
- MIC (Micronaire): índice de finura/maturidade da fibra (ideal: 3.5-4.9)
- UHM (Upper Half Mean): comprimento médio da fibra em polegadas (ideal: >1.10")
- STR (Strength/Resistência): resistência da fibra em gf/tex (ideal: >28)
- SCI (Spinning Consistency Index): índice de consistência de fiação (ideal: >130)
- UI (Uniformity Index): índice de uniformidade
- ELG (Elongation): alongamento

Dados disponíveis no sistema:
${dataContext}

Responda sempre em português brasileiro. Seja preciso com os números e cite os dados específicos quando relevante.

IMPORTANTE sobre gráficos:
Quando o usuário pedir para gerar um gráfico, comparar visualmente, ou qualquer visualização de dados:
1. Responda em formato JSON VÁLIDO com a seguinte estrutura (sem texto adicional antes ou depois):
{
  "message": "Sua mensagem curta aqui",
  "chart": {
    "type": "bar|line|pie|horizontalBar",
    "title": "Título do gráfico",
    "metric": "str|sci|mic|uhm|bales",
    "comparison": "producers|batches",
    "producers": ["nome1", "nome2"]
  }
}

Campos do chart:
- "type": tipo de gráfico (bar, horizontalBar, line, pie)
- "title": título descritivo do gráfico
- "metric": métrica a exibir (str, sci, mic, uhm, bales)
- "comparison": agrupar por "producers" ou "batches"
- "producers": lista de nomes de produtores/arquivos a incluir. Use [] vazio para incluir TODOS. Se o usuário mencionar produtores específicos, liste apenas esses.

Escolha o tipo de gráfico mais adequado:
- "bar": comparar poucos valores (até 6 itens)
- "horizontalBar": quando há muitos itens para comparar ou nomes longos
- "line": mostrar tendências ou evolução por lote
- "pie": mostrar proporções/distribuição

Se NÃO for pedido de gráfico, responda normalmente em texto sem JSON.`

    // Prepare messages for OpenAI - include conversation history
    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: "system", content: systemPrompt },
    ]

    // Add conversation history if provided
    if (history && Array.isArray(history)) {
      for (const msg of history as ChatMessage[]) {
        messages.push({
          role: msg.role,
          content: msg.content,
        })
      }
    }

    // Add current message
    messages.push({ role: "user", content: message })

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: "gpt-4o-mini",
      messages,
      temperature: 0.7,
      max_tokens: 1000,
    })

    const rawResponse = completion.choices[0]?.message?.content || "Desculpe, não consegui processar sua pergunta."

    // Try to parse AI response as JSON (for chart requests)
    let assistantMessage = rawResponse
    let chartData = null

    if (generateChart && storedData.allBatches.length > 0) {
      try {
        // Try to extract JSON from response - handle markdown code blocks too
        let jsonString = rawResponse

        // Remove markdown code blocks if present
        const codeBlockMatch = rawResponse.match(/```(?:json)?\s*([\s\S]*?)```/)
        if (codeBlockMatch) {
          jsonString = codeBlockMatch[1].trim()
        }

        // Try to extract JSON object
        const jsonMatch = jsonString.match(/\{[\s\S]*\}/)
        if (jsonMatch) {
          const parsed = JSON.parse(jsonMatch[0])

          if (parsed.chart && parsed.message) {
            assistantMessage = parsed.message
            const chartConfig = parsed.chart

            // Build chart data based on AI's recommendation
            const metric = chartConfig.metric || "str"
            const chartType = chartConfig.type || "bar"
            const title = chartConfig.title || "Comparativo"
            const comparison = chartConfig.comparison || "producers"
            const filterProducers: string[] = chartConfig.producers || []

            let labels: string[] = []
            let data: number[] = []
            let metricLabel = ""

            // Filter batches by producer if specified
            let filteredBatches = storedData.allBatches
            if (filterProducers.length > 0) {
              filteredBatches = storedData.allBatches.filter(batch => {
                // Use producerName if available, otherwise fall back to sourceFile
                const batchProducerName = (batch.producerName || batch.sourceFile.replace(".pdf", "").replace(".xlsx", "")).toLowerCase()
                return filterProducers.some(fp =>
                  batchProducerName.includes(fp.toLowerCase()) || fp.toLowerCase().includes(batchProducerName)
                )
              })
            }

            if (comparison === "batches") {
              // Show individual batches (for evolution/trend charts)
              labels = filteredBatches.map(b => `Lote ${b.batchNumber}`)

              switch (metric) {
                case "str":
                  data = filteredBatches.map(b => b.strAvg)
                  metricLabel = "STR (gf/tex)"
                  break
                case "sci":
                  data = filteredBatches.map(b => b.sciAvg || 0)
                  metricLabel = "SCI"
                  break
                case "mic":
                  data = filteredBatches.map(b => b.micAvg)
                  metricLabel = "Mic"
                  break
                case "uhm":
                  data = filteredBatches.map(b => b.uhmAvg)
                  metricLabel = "UHM (pol)"
                  break
                default:
                  data = filteredBatches.map(b => b.strAvg)
                  metricLabel = "STR (gf/tex)"
              }
            } else {
              // Group by producer (default)
              const byProducer: Record<string, {
                strSum: number; strCount: number;
                sciSum: number; sciCount: number;
                micSum: number; micCount: number;
                uhmSum: number; uhmCount: number;
                baleCount: number;
              }> = {}

              for (const batch of filteredBatches) {
                const producer = batch.producerName || batch.sourceFile.replace(".pdf", "").replace(".xlsx", "")
                if (!byProducer[producer]) {
                  byProducer[producer] = {
                    strSum: 0, strCount: 0,
                    sciSum: 0, sciCount: 0,
                    micSum: 0, micCount: 0,
                    uhmSum: 0, uhmCount: 0,
                    baleCount: 0
                  }
                }
                byProducer[producer].strSum += batch.strAvg
                byProducer[producer].strCount++
                byProducer[producer].micSum += batch.micAvg
                byProducer[producer].micCount++
                byProducer[producer].uhmSum += batch.uhmAvg
                byProducer[producer].uhmCount++
                byProducer[producer].baleCount += parseInt(batch.numberOfBales) || 0
                if (batch.sciAvg !== null && batch.sciAvg > 0) {
                  byProducer[producer].sciSum += batch.sciAvg
                  byProducer[producer].sciCount++
                }
              }

              labels = Object.keys(byProducer)

              switch (metric) {
                case "str":
                  data = labels.map(p => byProducer[p].strCount > 0 ? byProducer[p].strSum / byProducer[p].strCount : 0)
                  metricLabel = "STR Médio (gf/tex)"
                  break
                case "sci":
                  data = labels.map(p => byProducer[p].sciCount > 0 ? byProducer[p].sciSum / byProducer[p].sciCount : 0)
                  metricLabel = "SCI Médio"
                  break
                case "mic":
                  data = labels.map(p => byProducer[p].micCount > 0 ? byProducer[p].micSum / byProducer[p].micCount : 0)
                  metricLabel = "Mic Médio"
                  break
                case "uhm":
                  data = labels.map(p => byProducer[p].uhmCount > 0 ? byProducer[p].uhmSum / byProducer[p].uhmCount : 0)
                  metricLabel = "UHM Médio (pol)"
                  break
                case "bales":
                  data = labels.map(p => byProducer[p].baleCount)
                  metricLabel = "Quantidade de Fardos"
                  break
                default:
                  data = labels.map(p => byProducer[p].strCount > 0 ? byProducer[p].strSum / byProducer[p].strCount : 0)
                  metricLabel = "STR Médio (gf/tex)"
              }
            }

            chartData = {
              type: chartType,
              title,
              labels,
              datasets: [{ label: metricLabel, data }],
            }
          }
        }
      } catch {
        // If JSON parsing fails, keep the raw message and no chart
        assistantMessage = rawResponse
      }
    }

    return NextResponse.json({
      message: assistantMessage,
      chartData,
      hasData: storedData.allBatches.length > 0,
    })
  } catch (error) {
    console.error("Error in chat API:", error)
    return NextResponse.json({ error: "Failed to process message" }, { status: 500 })
  }
}

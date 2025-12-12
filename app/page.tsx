"use client"

import type React from "react"

import { useState, useRef, useEffect } from "react"
import { Upload, FileText, Download, Loader2, MessageCircle, Send, X, BarChart3 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { processFilesWithData } from "@/lib/pdf-processor"

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
}

interface ChartDataType {
  type: 'bar' | 'horizontalBar' | 'pie' | 'line'
  title: string
  labels: string[]
  datasets: { label: string; data: number[] }[]
}

interface ChatMessage {
  role: 'user' | 'assistant'
  content: string
  chartData?: ChartDataType
}

export default function PDFProcessorPage() {
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processedData, setProcessedData] = useState<Blob | null>(null)
  const [processedBatches, setProcessedBatches] = useState<BatchData[]>([])
  const [error, setError] = useState<string | null>(null)
  const [saving, setSaving] = useState(false)
  const [saved, setSaved] = useState(false)

  // Chat state
  const [chatOpen, setChatOpen] = useState(false)
  const [chatMessages, setChatMessages] = useState<ChatMessage[]>([])
  const [chatInput, setChatInput] = useState('')
  const [chatLoading, setChatLoading] = useState(false)
  const chatEndRef = useRef<HTMLDivElement>(null)

  // Scroll chat to bottom when new messages arrive
  useEffect(() => {
    chatEndRef.current?.scrollIntoView({ behavior: 'smooth' })
  }, [chatMessages])

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      setFiles(selectedFiles)
      setError(null)
      setProcessedData(null)
      setProcessedBatches([])
      setSaved(false)
    }
  }

  const handleProcess = async () => {
    if (files.length === 0) {
      setError("Por favor, selecione pelo menos um arquivo PDF ou Excel")
      return
    }

    setProcessing(true)
    setError(null)
    setProgress(0)
    setSaved(false)

    try {
      // Process files and get both blob and data
      const result = await processFilesWithData(files, (current, total) => {
        setProgress((current / total) * 100)
      })

      setProcessedData(result.blob)
      setProcessedBatches(result.data)
      setProgress(100)

    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while processing PDFs")
    } finally {
      setProcessing(false)
    }
  }

  const handleSaveData = async () => {
    if (!processedData || processedBatches.length === 0) return

    setSaving(true)
    try {
      // Save summary data
      const response = await fetch('/api/data', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: 'summary',
          data: {
            files: files.map(f => f.name),
            totalBatches: processedBatches.length,
            data: processedBatches
          }
        })
      })

      if (response.ok) {
        setSaved(true)
      } else {
        throw new Error('Failed to save data')
      }
    } catch (err) {
      setError('Erro ao salvar dados: ' + (err instanceof Error ? err.message : 'Erro desconhecido'))
    } finally {
      setSaving(false)
    }
  }

  const handleDownload = () => {
    if (processedData) {
      const url = URL.createObjectURL(processedData)
      const a = document.createElement("a")
      a.href = url
      a.download = `batch-summary-${new Date().toISOString().split("T")[0]}.xlsx`
      document.body.appendChild(a)
      a.click()
      document.body.removeChild(a)
      URL.revokeObjectURL(url)
    }
  }

  const handleClear = () => {
    setFiles([])
    setProcessedData(null)
    setProcessedBatches([])
    setError(null)
    setProgress(0)
    setSaved(false)
  }

  const handleSendMessage = async () => {
    if (!chatInput.trim() || chatLoading) return

    const userMessage = chatInput.trim()
    setChatInput('')

    // Keep current messages to send as history
    const currentMessages = [...chatMessages]
    setChatMessages(prev => [...prev, { role: 'user', content: userMessage }])
    setChatLoading(true)

    try {
      // Detect if user wants a chart/visualization
      const msgLower = userMessage.toLowerCase()
      const chartKeywords = [
        'gráfico', 'grafico', 'chart', 'visuali', 'mostre', 'mostra',
        'compare', 'compara', 'evolução', 'evolucao', 'tendência', 'tendencia',
        'distribuição', 'distribuicao', 'pizza', 'barras', 'linha'
      ]
      const wantsChart = chartKeywords.some(keyword => msgLower.includes(keyword))

      const response = await fetch('/api/chat', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: userMessage,
          generateChart: wantsChart,
          history: currentMessages
        })
      })

      const data = await response.json()

      if (data.error) {
        throw new Error(data.error)
      }

      // Include chart data in the message if returned
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: data.message,
        chartData: data.chartData || undefined
      }])
    } catch (err) {
      setChatMessages(prev => [...prev, {
        role: 'assistant',
        content: 'Desculpe, ocorreu um erro ao processar sua mensagem. Verifique se a chave da API OpenAI está configurada no arquivo .env'
      }])
    } finally {
      setChatLoading(false)
    }
  }

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault()
      handleSendMessage()
    }
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-primary/10 p-3">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mb-3 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            Processador de Lotes de Algodão
          </h1>
          <p className="text-pretty text-lg text-muted-foreground">
            Extraia dados de PDFs e Excel e gere resumos em planilha
          </p>
        </div>

        <Card className="overflow-hidden border-border bg-card p-8 shadow-lg">
          {/* Upload Section */}
          <div className="mb-8">
            <label
              htmlFor="file-upload"
              className="group relative flex cursor-pointer flex-col items-center justify-center rounded-xl border-2 border-dashed border-border bg-muted/30 px-6 py-12 transition-all hover:border-primary/50 hover:bg-muted/50"
            >
              <Upload className="mb-4 h-12 w-12 text-muted-foreground transition-colors group-hover:text-primary" />
              <p className="mb-2 text-base font-medium text-foreground">
                {files.length > 0
                  ? `${files.length} arquivo${files.length > 1 ? "s" : ""} selecionado${files.length > 1 ? "s" : ""}`
                  : "Clique para enviar PDFs ou Excel"}
              </p>
              <p className="text-sm text-muted-foreground">Selecione arquivos PDF ou Excel com dados de classificação de algodão</p>
              <input
                id="file-upload"
                type="file"
                multiple
                accept=".pdf,.xlsx,.xls"
                onChange={handleFileChange}
                className="sr-only"
                disabled={processing}
              />
            </label>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3 text-sm font-medium text-foreground">Arquivos Selecionados</h3>
              <div className="max-h-48 space-y-2 overflow-y-auto rounded-lg border border-border bg-muted/20 p-4">
                {files.map((file, index) => (
                  <div key={index} className="flex items-center gap-3 rounded-md bg-background px-3 py-2 text-sm">
                    <FileText className="h-4 w-4 text-primary" />
                    <span className="flex-1 truncate text-foreground">{file.name}</span>
                    <span className="text-xs text-muted-foreground">{(file.size / 1024).toFixed(1)} KB</span>
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* Progress Bar */}
          {processing && (
            <div className="mb-8">
              <div className="mb-2 flex items-center justify-between text-sm">
                <span className="font-medium text-foreground">Processando arquivos...</span>
                <span className="text-muted-foreground">{Math.round(progress)}%</span>
              </div>
              <Progress value={progress} className="h-2" />
            </div>
          )}

          {/* Error Message */}
          {error && (
            <div className="mb-8 rounded-lg border border-destructive/50 bg-destructive/10 p-4 text-sm text-destructive">
              {error}
            </div>
          )}

          {/* Success Message */}
          {saved && (
            <div className="mb-8 rounded-lg border border-green-500/50 bg-green-500/10 p-4 text-sm text-green-700 dark:text-green-400">
              Dados salvos com sucesso! Agora você pode usar o chat para fazer perguntas.
            </div>
          )}

          {/* Action Buttons */}
          <div className="flex flex-col gap-3 sm:flex-row">
            {!processedData ? (
              <>
                <Button
                  onClick={handleProcess}
                  disabled={processing || files.length === 0}
                  className="flex-1"
                  size="lg"
                >
                  {processing ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Processando...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Processar Arquivos
                    </>
                  )}
                </Button>
                {files.length > 0 && (
                  <Button onClick={handleClear} variant="outline" disabled={processing} size="lg">
                    Limpar
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button onClick={handleDownload} className="flex-1" size="lg">
                  <Download className="mr-2 h-4 w-4" />
                  Baixar Resumo Excel
                </Button>
                <Button
                  onClick={handleSaveData}
                  variant="secondary"
                  size="lg"
                  disabled={saving || saved}
                >
                  {saving ? (
                    <>
                      <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                      Salvando...
                    </>
                  ) : saved ? (
                    <>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Salvo!
                    </>
                  ) : (
                    <>
                      <BarChart3 className="mr-2 h-4 w-4" />
                      Salvar para Análise
                    </>
                  )}
                </Button>
                <Button onClick={handleClear} variant="outline" size="lg">
                  Novos Arquivos
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* Info Section */}
        <div className="mt-12 rounded-xl border border-border bg-card/50 p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">O que é extraído:</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">Do Cabeçalho:</h4>
              <ul className="space-y-1 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Número do Lote (Romaneio/Bloco)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Peso Total
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Quantidade de Fardos
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">Da Tabela (Min/Média/Max):</h4>
              <ul className="space-y-1 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Mic (Micronaire)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  UHM (Comprimento - normalizado para polegadas)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  STR (Resistência)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  SCI (quando disponível)
                </li>
              </ul>
            </div>
            <div className="sm:col-span-2">
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">Formatos Suportados:</h4>
              <ul className="space-y-1 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500" />
                  PDF - Laudos de classificação (ABAPA, AGOPA, Minas Cotton, G4 COTTON, etc.)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-green-500" />
                  Excel (.xlsx/.xls) - Planilhas de HVI com dados por fardo ou resumo
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                  Colunas em Português ou Inglês (detectadas automaticamente)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-blue-500" />
                  UHM em mm ou polegadas (convertido automaticamente)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>

      {/* Chat Button */}
      <button
        onClick={() => setChatOpen(!chatOpen)}
        className="fixed bottom-6 right-6 z-50 flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground shadow-lg transition-transform hover:scale-105"
        title="Pergunte sobre os dados"
      >
        {chatOpen ? <X className="h-6 w-6" /> : <MessageCircle className="h-6 w-6" />}
      </button>

      {/* Chat Panel */}
      {chatOpen && (
        <div className="fixed bottom-24 right-6 z-50 flex h-[500px] w-[380px] flex-col rounded-xl border border-border bg-card shadow-2xl">
          {/* Chat Header */}
          <div className="flex items-center gap-3 border-b border-border p-4">
            <div className="flex h-10 w-10 items-center justify-center rounded-full bg-primary/10">
              <MessageCircle className="h-5 w-5 text-primary" />
            </div>
            <div>
              <h3 className="font-semibold text-foreground">Assistente de Algodão</h3>
              <p className="text-xs text-muted-foreground">Pergunte sobre os dados processados</p>
            </div>
          </div>

          {/* Chat Messages */}
          <div className="flex-1 overflow-y-auto p-4 space-y-4">
            {chatMessages.length === 0 && (
              <div className="text-center text-sm text-muted-foreground py-8">
                <p className="mb-2">Olá! Sou seu assistente de análise de algodão.</p>
                <p className="text-xs">Processe e salve alguns arquivos, depois me pergunte sobre os dados.</p>
                <p className="text-xs mt-2">Exemplos:</p>
                <p className="text-xs italic">&quot;Qual a média de SCI do G4 Cotton?&quot;</p>
                <p className="text-xs italic">&quot;Compare a resistência dos produtores&quot;</p>
              </div>
            )}
            {chatMessages.map((msg, index) => (
              <div key={index} className="space-y-2">
                <div
                  className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}
                >
                  <div
                    className={`max-w-[85%] rounded-lg px-4 py-2 text-sm ${
                      msg.role === 'user'
                        ? 'bg-primary text-primary-foreground'
                        : 'bg-muted text-foreground'
                    }`}
                  >
                    <p className="whitespace-pre-wrap">{msg.content}</p>
                  </div>
                </div>
                {/* Chart attached to this message */}
                {msg.chartData && msg.chartData.datasets.length > 0 && (
                  <div className="flex justify-start">
                    <div className="max-w-[90%] w-full bg-muted rounded-lg p-4">
                      <div className="flex items-center gap-2 mb-3">
                        <BarChart3 className="h-4 w-4 text-primary" />
                        <span className="text-sm font-medium text-foreground">
                          {msg.chartData.title || msg.chartData.datasets[0].label}
                        </span>
                      </div>

                      {/* Pie Chart */}
                      {msg.chartData.type === 'pie' && (
                        <div className="space-y-2">
                          {(() => {
                            const total = msg.chartData!.datasets[0].data.reduce((a, b) => a + b, 0)
                            const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500']
                            return msg.chartData!.labels.map((label, idx) => {
                              const value = msg.chartData!.datasets[0].data[idx] || 0
                              const percent = total > 0 ? (value / total) * 100 : 0
                              return (
                                <div key={label} className="flex items-center gap-2">
                                  <div className={`w-3 h-3 rounded-full ${colors[idx % colors.length]}`} />
                                  <div className="flex-1 text-xs text-foreground truncate" title={label}>
                                    {label}
                                  </div>
                                  <div className="text-xs text-muted-foreground">
                                    {percent.toFixed(1)}%
                                  </div>
                                  <div className="w-16 text-xs text-right font-medium text-foreground">
                                    {value.toFixed(1)}
                                  </div>
                                </div>
                              )
                            })
                          })()}
                          <div className="flex flex-wrap gap-2 mt-3 pt-2 border-t border-border">
                            {(() => {
                              const total = msg.chartData!.datasets[0].data.reduce((a, b) => a + b, 0)
                              const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500']
                              let cumulativePercent = 0
                              return (
                                <div className="w-full h-6 rounded-full overflow-hidden flex">
                                  {msg.chartData!.labels.map((label, idx) => {
                                    const value = msg.chartData!.datasets[0].data[idx] || 0
                                    const percent = total > 0 ? (value / total) * 100 : 0
                                    cumulativePercent += percent
                                    return (
                                      <div
                                        key={label}
                                        className={`h-full ${colors[idx % colors.length]}`}
                                        style={{ width: `${percent}%` }}
                                        title={`${label}: ${percent.toFixed(1)}%`}
                                      />
                                    )
                                  })}
                                </div>
                              )
                            })()}
                          </div>
                        </div>
                      )}

                      {/* Bar Chart (vertical) - only for 6 or fewer items */}
                      {msg.chartData.type === 'bar' && msg.chartData.labels.length <= 6 && (
                        <div className="space-y-2">
                          {(() => {
                            const data = msg.chartData!.datasets[0].data
                            const validData = data.filter(v => v > 0)
                            const maxValue = Math.max(...validData)
                            const minValue = Math.min(...validData)
                            const range = maxValue - minValue
                            const useRangeScale = range > 0 && (range / maxValue) < 0.3
                            const colors = ['bg-blue-500', 'bg-green-500', 'bg-orange-500', 'bg-purple-500', 'bg-pink-500', 'bg-cyan-500']

                            return (
                              <>
                                <div className="flex items-end justify-center gap-4 h-36">
                                  {msg.chartData!.labels.map((label, idx) => {
                                    const value = data[idx] || 0
                                    let heightPercent: number
                                    if (useRangeScale && range > 0) {
                                      heightPercent = 20 + ((value - minValue) / range) * 80
                                    } else {
                                      heightPercent = maxValue > 0 ? (value / maxValue) * 100 : 0
                                    }
                                    return (
                                      <div key={label} className="flex flex-col items-center gap-1" style={{ width: '48px' }}>
                                        <span className="text-xs text-muted-foreground font-medium">{value.toFixed(1)}</span>
                                        <div
                                          className={`w-10 ${colors[idx % colors.length]} rounded-t`}
                                          style={{ height: `${Math.max(heightPercent, 10)}%` }}
                                        />
                                        <span className="text-[9px] text-muted-foreground text-center truncate w-full" title={label}>
                                          {label.length > 8 ? label.slice(0, 8) + '..' : label}
                                        </span>
                                      </div>
                                    )
                                  })}
                                </div>
                              </>
                            )
                          })()}
                        </div>
                      )}

                      {/* Bar Chart falls back to horizontal for many items */}
                      {msg.chartData.type === 'bar' && msg.chartData.labels.length > 6 && (
                        <div className="space-y-2">
                          {(() => {
                            const data = msg.chartData!.datasets[0].data
                            const validData = data.filter(v => v > 0)
                            const maxValue = Math.max(...validData)
                            const minValue = Math.min(...validData)
                            const range = maxValue - minValue
                            const useRangeScale = range > 0 && (range / maxValue) < 0.3

                            return msg.chartData!.labels.map((label, idx) => {
                              const value = data[idx] || 0
                              let percentage: number
                              if (useRangeScale && range > 0) {
                                percentage = 20 + ((value - minValue) / range) * 80
                              } else {
                                percentage = maxValue > 0 ? (value / maxValue) * 100 : 0
                              }
                              return (
                                <div key={label} className="flex items-center gap-2">
                                  <div className="w-28 text-xs text-foreground truncate" title={label}>
                                    {label.length > 18 ? label.slice(0, 18) + '...' : label}
                                  </div>
                                  <div className="flex-1 h-5 bg-muted-foreground/20 rounded overflow-hidden">
                                    <div
                                      className="h-full bg-primary rounded"
                                      style={{ width: `${Math.max(percentage, 5)}%` }}
                                    />
                                  </div>
                                  <div className="w-12 text-xs text-right font-medium text-foreground">
                                    {value.toFixed(1)}
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      )}

                      {/* Horizontal Bar Chart */}
                      {(msg.chartData.type === 'horizontalBar' || !msg.chartData.type) && (
                        <div className="space-y-2">
                          {(() => {
                            const data = msg.chartData!.datasets[0].data
                            const validData = data.filter(v => v > 0)
                            const maxValue = Math.max(...validData)
                            const minValue = Math.min(...validData)
                            const range = maxValue - minValue
                            // Use range-based scaling for similar values
                            const useRangeScale = range > 0 && (range / maxValue) < 0.3

                            return msg.chartData!.labels.map((label, labelIndex) => {
                              const value = data[labelIndex] || 0
                              let percentage: number
                              if (useRangeScale && range > 0) {
                                // Scale based on range: min value gets 20%, max gets 100%
                                percentage = 20 + ((value - minValue) / range) * 80
                              } else {
                                percentage = maxValue > 0 ? (value / maxValue) * 100 : 0
                              }
                              return (
                                <div key={label} className="flex items-center gap-2">
                                  <div className="w-28 text-xs text-foreground truncate" title={label}>
                                    {label.length > 18 ? label.slice(0, 18) + '...' : label}
                                  </div>
                                  <div className="flex-1 h-6 bg-muted-foreground/20 rounded overflow-hidden">
                                    <div
                                      className="h-full bg-primary rounded transition-all"
                                      style={{ width: `${percentage}%`, minWidth: '8px' }}
                                    />
                                  </div>
                                  <div className="w-14 text-xs text-right font-medium text-foreground">
                                    {value.toFixed(1)}
                                  </div>
                                </div>
                              )
                            })
                          })()}
                        </div>
                      )}

                      {/* Line Chart */}
                      {msg.chartData.type === 'line' && (
                        <div className="space-y-2">
                          <div className="relative h-32 flex items-end">
                            <svg className="w-full h-full" viewBox="0 0 100 100" preserveAspectRatio="none">
                              {(() => {
                                const data = msg.chartData!.datasets[0].data
                                const maxValue = Math.max(...data.filter(v => v > 0))
                                const minValue = Math.min(...data.filter(v => v > 0))
                                const range = maxValue - minValue || 1
                                const points = data.map((value, idx) => {
                                  const x = (idx / (data.length - 1)) * 100
                                  const y = 100 - ((value - minValue) / range) * 80 - 10
                                  return `${x},${y}`
                                }).join(' ')
                                return (
                                  <>
                                    <polyline
                                      fill="none"
                                      stroke="currentColor"
                                      strokeWidth="2"
                                      className="text-primary"
                                      points={points}
                                    />
                                    {data.map((value, idx) => {
                                      const x = (idx / (data.length - 1)) * 100
                                      const y = 100 - ((value - minValue) / range) * 80 - 10
                                      return (
                                        <circle
                                          key={idx}
                                          cx={x}
                                          cy={y}
                                          r="3"
                                          className="fill-primary"
                                        />
                                      )
                                    })}
                                  </>
                                )
                              })()}
                            </svg>
                          </div>
                          <div className="flex justify-between">
                            {msg.chartData.labels.map((label) => (
                              <div key={label} className="text-[9px] text-muted-foreground truncate" title={label}>
                                {label.length > 6 ? label.slice(0, 6) + '..' : label}
                              </div>
                            ))}
                          </div>
                        </div>
                      )}

                      {/* Legend */}
                      <div className="mt-3 pt-2 border-t border-border">
                        <span className="text-[10px] text-muted-foreground">{msg.chartData.datasets[0].label}</span>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            ))}
            {chatLoading && (
              <div className="flex justify-start">
                <div className="bg-muted rounded-lg px-4 py-2">
                  <Loader2 className="h-4 w-4 animate-spin text-muted-foreground" />
                </div>
              </div>
            )}
            <div ref={chatEndRef} />
          </div>

          {/* Chat Input */}
          <div className="border-t border-border p-4">
            <div className="flex gap-2">
              <input
                type="text"
                value={chatInput}
                onChange={(e) => setChatInput(e.target.value)}
                onKeyPress={handleKeyPress}
                placeholder="Digite sua pergunta..."
                className="flex-1 rounded-lg border border-border bg-background px-4 py-2 text-sm text-foreground placeholder:text-muted-foreground focus:border-primary focus:outline-none focus:ring-1 focus:ring-primary"
                disabled={chatLoading}
              />
              <Button
                onClick={handleSendMessage}
                disabled={!chatInput.trim() || chatLoading}
                size="icon"
              >
                <Send className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}

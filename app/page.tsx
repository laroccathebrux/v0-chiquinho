"use client"

import type React from "react"

import { useState } from "react"
import { Upload, FileText, Download, Loader2 } from "lucide-react"
import { Button } from "@/components/ui/button"
import { Card } from "@/components/ui/card"
import { Progress } from "@/components/ui/progress"
import { processPDFs } from "@/lib/pdf-processor"

export default function PDFProcessorPage() {
  const [files, setFiles] = useState<File[]>([])
  const [processing, setProcessing] = useState(false)
  const [progress, setProgress] = useState(0)
  const [processedData, setProcessedData] = useState<any>(null)
  const [error, setError] = useState<string | null>(null)

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files) {
      const selectedFiles = Array.from(e.target.files)
      setFiles(selectedFiles)
      setError(null)
      setProcessedData(null)
    }
  }

  const handleProcess = async () => {
    if (files.length === 0) {
      setError("Please select at least one PDF file")
      return
    }

    setProcessing(true)
    setError(null)
    setProgress(0)

    try {
      const result = await processPDFs(files, (current, total) => {
        setProgress((current / total) * 100)
      })

      setProcessedData(result)
      setProgress(100)
    } catch (err) {
      setError(err instanceof Error ? err.message : "An error occurred while processing PDFs")
    } finally {
      setProcessing(false)
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
    setError(null)
    setProgress(0)
  }

  return (
    <div className="min-h-screen bg-background">
      <div className="mx-auto max-w-4xl px-4 py-12 sm:px-6 lg:px-8">
        <div className="mb-12 text-center">
          <div className="mb-4 inline-flex items-center justify-center rounded-2xl bg-primary/10 p-3">
            <FileText className="h-8 w-8 text-primary" />
          </div>
          <h1 className="mb-3 text-balance text-4xl font-semibold tracking-tight text-foreground sm:text-5xl">
            PDF Batch Processor
          </h1>
          <p className="text-pretty text-lg text-muted-foreground">
            Extract batch data from multiple PDFs and generate Excel summaries
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
                  ? `${files.length} file${files.length > 1 ? "s" : ""} selected`
                  : "Click to upload PDFs"}
              </p>
              <p className="text-sm text-muted-foreground">Select multiple PDF files with the same structure</p>
              <input
                id="file-upload"
                type="file"
                multiple
                accept=".pdf"
                onChange={handleFileChange}
                className="sr-only"
                disabled={processing}
              />
            </label>
          </div>

          {/* File List */}
          {files.length > 0 && (
            <div className="mb-8">
              <h3 className="mb-3 text-sm font-medium text-foreground">Selected Files</h3>
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
                <span className="font-medium text-foreground">Processing PDFs...</span>
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
                      Processing...
                    </>
                  ) : (
                    <>
                      <FileText className="mr-2 h-4 w-4" />
                      Process PDFs
                    </>
                  )}
                </Button>
                {files.length > 0 && (
                  <Button onClick={handleClear} variant="outline" disabled={processing} size="lg">
                    Clear
                  </Button>
                )}
              </>
            ) : (
              <>
                <Button onClick={handleDownload} className="flex-1" size="lg">
                  <Download className="mr-2 h-4 w-4" />
                  Download Excel Summary
                </Button>
                <Button onClick={handleClear} variant="outline" size="lg">
                  Process New Files
                </Button>
              </>
            )}
          </div>
        </Card>

        {/* Info Section */}
        <div className="mt-12 rounded-xl border border-border bg-card/50 p-6">
          <h3 className="mb-4 text-sm font-semibold text-foreground">What gets extracted:</h3>
          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">From Header:</h4>
              <ul className="space-y-1 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Batch Number
                </li>
              </ul>
            </div>
            <div>
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">From Footer:</h4>
              <ul className="space-y-1 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Batch Weight
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Number of Bales
                </li>
              </ul>
            </div>
            <div className="sm:col-span-2">
              <h4 className="mb-2 text-xs font-medium text-muted-foreground">From Table (Min/Avg/Max):</h4>
              <ul className="space-y-1 text-sm text-foreground">
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Mic (Micronaire)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  Pol (Polarization)
                </li>
                <li className="flex items-start gap-2">
                  <span className="mt-1 h-1.5 w-1.5 rounded-full bg-primary" />
                  STR (Strength)
                </li>
              </ul>
            </div>
          </div>
        </div>
      </div>
    </div>
  )
}

import * as XLSX from "xlsx"

interface BatchData {
  batchNumber: string
  batchWeight: string
  numberOfBales: string
  micMin: number
  micAvg: number
  micMax: number
  polMin: number
  polAvg: number
  polMax: number
  strMin: number
  strAvg: number
  strMax: number
}

// Load PDF.js from CDN using legacy UMD build
let pdfjsLibPromise: Promise<any> | null = null

function loadPdfJs(): Promise<any> {
  if (pdfjsLibPromise) return pdfjsLibPromise

  pdfjsLibPromise = new Promise((resolve, reject) => {
    // Check if already loaded
    if ((window as any).pdfjsLib) {
      const lib = (window as any).pdfjsLib
      lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
      resolve(lib)
      return
    }

    // Load the legacy UMD build
    const script = document.createElement("script")
    script.src = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js"
    script.async = true

    script.onload = () => {
      const lib = (window as any).pdfjsLib
      if (lib) {
        lib.GlobalWorkerOptions.workerSrc = "https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js"
        resolve(lib)
      } else {
        reject(new Error("PDF.js library not found after loading"))
      }
    }

    script.onerror = () => reject(new Error("Failed to load PDF.js from CDN"))
    document.head.appendChild(script)
  })

  return pdfjsLibPromise
}

export async function processPDFs(files: File[], onProgress?: (current: number, total: number) => void): Promise<Blob> {
  const results: BatchData[] = []

  for (let i = 0; i < files.length; i++) {
    try {
      const data = await extractDataFromPDF(files[i])
      results.push(data)
      onProgress?.(i + 1, files.length)
    } catch (error) {
      console.error(`Error processing ${files[i].name}:`, error)
      throw new Error(`Failed to process ${files[i].name}: ${error instanceof Error ? error.message : "Unknown error"}`)
    }
  }

  return generateExcel(results)
}

async function extractDataFromPDF(file: File): Promise<BatchData> {
  const pdfjs = await loadPdfJs()
  const arrayBuffer = await file.arrayBuffer()
  const pdf = await pdfjs.getDocument({ data: arrayBuffer }).promise

  let fullText = ""

  // Extract text from all pages
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i)
    const textContent = await page.getTextContent()
    const pageText = textContent.items.map((item: any) => item.str).join(" ")
    fullText += pageText + "\n"
  }

  // Debug: log extracted text (remove in production)
  console.log("Extracted text:", fullText.substring(0, 2000))

  // Extract batch number (Lote: X)
  let batchNumber = "N/A"

  // Try multiple patterns to find "Lote" followed by a number
  const batchPatterns = [
    /Lote\s*:\s*(\d{1,3})(?!\d)/i,        // Lote: 2
    /Lote\s+(\d{1,3})(?!\d)/i,            // Lote 2
    /Lote[:\s]+(\d{1,3})(?!\d)/i,         // Lote: 2 or Lote 2
  ]

  for (const pattern of batchPatterns) {
    const match = fullText.match(pattern)
    if (match) {
      batchNumber = match[1].trim()
      console.log(`Batch number found with pattern ${pattern}: ${batchNumber}`)
      break
    }
  }

  // Fallback: extract from filename (e.g., "blc 2.pdf" -> 2, "blc 11.pdf" -> 11)
  if (batchNumber === "N/A") {
    const filenameMatch = file.name.match(/blc\s*(\d+)/i)
    if (filenameMatch) {
      batchNumber = filenameMatch[1]
      console.log(`Batch number extracted from filename: ${batchNumber}`)
    }
  }

  // Debug: show where "Lote" appears
  const loteIndex = fullText.toLowerCase().indexOf("lote")
  if (loteIndex >= 0) {
    console.log("Found 'Lote' at position", loteIndex, "context:", fullText.substring(loteIndex, loteIndex + 50))
  } else {
    console.log("'Lote' not found in extracted text")
  }

  console.log("File:", file.name, "-> Batch:", batchNumber)

  // Extract total bales and weight from summary line: "138 Fardos 27.901" or "138 Fardos 27,901"
  // Pattern: number + "Fardos" + number (with optional comma/dot as decimal/thousands separator)
  const summaryMatch = fullText.match(/(\d+)\s*Fardos\s+([\d.,]+)/i)
  const numberOfBales = summaryMatch ? summaryMatch[1] : "N/A"
  const batchWeight = summaryMatch ? summaryMatch[2].replace(",", ".") : "N/A"

  // Extract statistics from summary section
  // Looking for patterns like:
  // MÉDIA: 4,36 1,196 30,39 31,5 82,4 ...
  // MÍNIMO: 4,05 1,110 28,20 28,5 80,0 ...
  // MÁXIMO: 4,65 1,307 33,20 34,2 85,0 ...

  // The columns after the label are: Mic, Len, Pol, Str, UI, Elg, Rd, +b, ...
  // We want: Mic (index 0), Pol (index 2), Str (index 3)

  const extractStatsRow = (label: string): number[] => {
    // Match the label followed by numbers (comma or dot as decimal separator)
    const regex = new RegExp(`${label}[:\\s]+([\\d,\\.\\s]+)`, "i")
    const match = fullText.match(regex)
    if (!match) return []

    // Extract all numbers from the matched string
    const numbersStr = match[1]
    const numbers = numbersStr
      .split(/\s+/)
      .map(n => n.replace(",", "."))
      .filter(n => /^\d+\.?\d*$/.test(n))
      .map(n => parseFloat(n))

    return numbers
  }

  const mediaRow = extractStatsRow("MÉDIA")
  const minimoRow = extractStatsRow("MÍNIMO")
  const maximoRow = extractStatsRow("MÁXIMO")

  console.log("MÉDIA row:", mediaRow)
  console.log("MÍNIMO row:", minimoRow)
  console.log("MÁXIMO row:", maximoRow)

  // Column indices (0-based): Mic=0, Len=1, Pol=2, Str=3
  const getMicValue = (row: number[]) => row[0] || 0
  const getPolValue = (row: number[]) => row[2] || 0
  const getStrValue = (row: number[]) => row[3] || 0

  return {
    batchNumber,
    batchWeight,
    numberOfBales,
    micMin: getMicValue(minimoRow),
    micAvg: getMicValue(mediaRow),
    micMax: getMicValue(maximoRow),
    polMin: getPolValue(minimoRow),
    polAvg: getPolValue(mediaRow),
    polMax: getPolValue(maximoRow),
    strMin: getStrValue(minimoRow),
    strAvg: getStrValue(mediaRow),
    strMax: getStrValue(maximoRow),
  }
}

function generateExcel(data: BatchData[]): Blob {
  // Create worksheet data
  const wsData = [
    [
      "Lote (Batch)",
      "Peso Total (kg)",
      "Qtd Fardos",
      "Mic (min)",
      "Mic (média)",
      "Mic (max)",
      "Pol (min)",
      "Pol (média)",
      "Pol (max)",
      "Str (min)",
      "Str (média)",
      "Str (max)",
    ],
    ...data.map((row) => [
      row.batchNumber,
      row.batchWeight,
      row.numberOfBales,
      row.micMin.toFixed(2),
      row.micAvg.toFixed(2),
      row.micMax.toFixed(2),
      row.polMin.toFixed(2),
      row.polAvg.toFixed(2),
      row.polMax.toFixed(2),
      row.strMin.toFixed(2),
      row.strAvg.toFixed(2),
      row.strMax.toFixed(2),
    ]),
  ]

  // Create workbook and worksheet
  const wb = XLSX.utils.book_new()
  const ws = XLSX.utils.aoa_to_sheet(wsData)

  // Set column widths
  ws["!cols"] = [
    { wch: 12 },
    { wch: 14 },
    { wch: 12 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
    { wch: 10 },
    { wch: 12 },
    { wch: 10 },
  ]

  XLSX.utils.book_append_sheet(wb, ws, "Resumo Lotes")

  // Generate Excel file
  const excelBuffer = XLSX.write(wb, { bookType: "xlsx", type: "array" })
  return new Blob([excelBuffer], { type: "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet" })
}

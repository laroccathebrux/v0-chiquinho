# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project Overview

**Chiquinho** is a PDF Batch Processor application for extracting cotton batch quality data from PDFs and generating Excel summaries. It processes PDF documents containing cotton bale information (batch numbers, weights, and quality metrics like Micronaire, Polarization, and Strength).

## Development Commands

\`\`\`bash
npm run dev      # Start development server (localhost:3000)
npm run build    # Production build
npm run start    # Start production server
npm run lint     # Run ESLint
\`\`\`

## Architecture

### Tech Stack
- **Framework**: Next.js 16 with App Router
- **Language**: TypeScript (strict mode)
- **Styling**: Tailwind CSS v4 with shadcn/ui components (new-york style)
- **PDF Processing**: pdfjs-dist (loaded from CDN to avoid webpack issues)
- **Excel Generation**: xlsx library

### Key Files
- `app/page.tsx` - Main UI component with file upload, processing state, and download functionality
- `lib/pdf-processor.ts` - Core PDF extraction logic and Excel generation
- `components/ui/` - shadcn/ui components (Button, Card, Progress)
- `lib/utils.ts` - Tailwind class merge utility (`cn` function)

### Data Flow
1. User uploads multiple PDF files via drag-drop or file picker
2. PDF.js loaded dynamically from CDN (avoids webpack bundling issues)
3. `processPDFs()` iterates through files, extracting text from each PDF
4. Extracts from summary section: MÉDIA, MÍNIMO, MÁXIMO rows
5. Extracts: Lote (batch number), Fardos (bale count), Peso (weight)
6. Results compiled into Excel file via `generateExcel()`

### PDF Format (CooperFibra HVI Reports)
The processor expects PDFs with this structure:
- Header: `Lote: X` (batch number)
- Data table with columns: Fardo, Peso, Mic, Len, Pol, Str, UI, Elg, Rd, +b, CG, Leaf, Area, Count, SFI, Mat, SCI, CSP
- Summary section at bottom with:
  - `XXX Fardos YYY.YYY` (total bales and weight)
  - `MÉDIA:` (averages)
  - `MÍNIMO:` (minimums)
  - `MÁXIMO:` (maximums)

## Path Aliases

Configured in `tsconfig.json`:
- `@/*` maps to project root (e.g., `@/components/ui/button`)

## Environment Notes

This codebase may be deployed to a Raspberry Pi. System commands in development are run on MacBook, not the deployment target.

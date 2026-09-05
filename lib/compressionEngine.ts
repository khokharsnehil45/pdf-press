import { PDFDocument } from "pdf-lib";

export type CompressionTier = "AGGRESSIVE" | "BALANCED" | "LOSSLESS";

export type PdfJsPage = {
  getViewport: (options: { scale: number }) => { width: number; height: number };
  render: (options: {
    canvasContext: CanvasRenderingContext2D;
    viewport: { width: number; height: number };
  }) => { promise: Promise<void> };
};

export type PdfJsDocument = {
  numPages: number;
  getPage: (pageNum: number) => Promise<PdfJsPage>;
};

export type PdfJsModule = {
  getDocument: (options: { data: ArrayBuffer }) => { promise: Promise<PdfJsDocument> };
  GlobalWorkerOptions?: { workerSrc: string };
};

export interface CompressionResult {
  bytes: Uint8Array;
  originalSize: number;
  compressedSize: number;
  savedBytes: number;
  compressionRatio: number; // percentage saved (e.g. 40 for 40% reduction, 0 for no change)
  wasOriginalKept: boolean;
  methodUsed: "raster" | "structural" | "original_fallback";
  note: string;
}

/**
 * Dynamically load pdfjs-dist in browser environments.
 */
export const getPdfJs = async (): Promise<PdfJsModule | null> => {
  if (typeof window === "undefined") return null;
  try {
    const pdfjsLib = (await import("pdfjs-dist/legacy/build/pdf.js").catch(
      () => import("pdfjs-dist/build/pdf")
    )) as unknown as PdfJsModule;

    if (pdfjsLib?.GlobalWorkerOptions) {
      pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js`;
    }
    return pdfjsLib;
  } catch (err) {
    console.warn("Could not load pdfjs-dist:", err);
    return null;
  }
};

/**
 * Format bytes to human readable format (e.g., "12.4 KB")
 */
export const formatBytes = (bytes: number): string => {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + " " + sizes[i];
};

/**
 * Correctly format savings percentage for display.
 * Avoids "-0%" and misleading negative percentages.
 */
export const formatSavingsDisplay = (
  originalSize: number,
  compressedSize: number | null,
  wasOriginalKept?: boolean
): { text: string; isPositive: boolean; isNeutral: boolean; isNegative: boolean } => {
  if (compressedSize === null || originalSize <= 0) {
    return { text: "0%", isPositive: false, isNeutral: true, isNegative: false };
  }

  if (wasOriginalKept || compressedSize === originalSize) {
    return { text: "0% (Original kept)", isPositive: false, isNeutral: true, isNegative: false };
  }

  const savedBytes = originalSize - compressedSize;
  const ratio = Math.round((savedBytes / originalSize) * 100);

  if (ratio > 0) {
    return { text: `-${ratio}%`, isPositive: true, isNeutral: false, isNegative: false };
  } else if (ratio < 0) {
    return { text: `+${Math.abs(ratio)}% (grew)`, isPositive: false, isNeutral: false, isNegative: true };
  }

  return { text: "0%", isPositive: false, isNeutral: true, isNegative: false };
};

/**
 * Calculates aggregate stats across completed jobs.
 */
export const calculateAggregateStats = (
  readyJobs: Array<{ originalSize: number; compressedSize: number | null; wasOriginalKept?: boolean }>
) => {
  const totalOriginal = readyJobs.reduce((acc, j) => acc + j.originalSize, 0);
  const totalCompressed = readyJobs.reduce(
    (acc, j) => acc + (j.compressedSize !== null ? j.compressedSize : j.originalSize),
    0
  );
  const totalSaved = totalOriginal - totalCompressed;

  let avgRatio = 0;
  if (totalOriginal > 0) {
    avgRatio = Math.round((totalSaved / totalOriginal) * 100);
  }

  let ratioDisplay = "0%";
  if (avgRatio > 0) {
    ratioDisplay = `${avgRatio}%`;
  } else if (avgRatio < 0) {
    ratioDisplay = `+${Math.abs(avgRatio)}% (grew)`;
  } else {
    ratioDisplay = "0%";
  }

  let savingsDisplay = "0 B";
  if (totalSaved > 0) {
    savingsDisplay = formatBytes(totalSaved);
  } else if (totalSaved < 0) {
    savingsDisplay = `+${formatBytes(Math.abs(totalSaved))} (grew)`;
  }

  return {
    totalOriginal,
    totalCompressed,
    totalSaved,
    avgRatio,
    ratioDisplay,
    savingsDisplay,
  };
};

/**
 * Structural / stream compaction using pdf-lib.
 * Flate-compresses object streams and strips unnecessary metadata when appropriate.
 */
export const compressStructural = async (
  arrayBuffer: ArrayBuffer,
  tier: CompressionTier
): Promise<Uint8Array> => {
  const pdfDoc = await PDFDocument.load(arrayBuffer, {
    updateMetadata: false,
    ignoreEncryption: true,
  });

  if (tier === "AGGRESSIVE") {
    pdfDoc.setTitle("");
    pdfDoc.setAuthor("");
    pdfDoc.setSubject("");
    pdfDoc.setKeywords([]);
    pdfDoc.setProducer("");
    pdfDoc.setCreator("");
  } else if (tier === "BALANCED") {
    pdfDoc.setSubject("");
    pdfDoc.setKeywords([]);
  }

  return await pdfDoc.save({
    useObjectStreams: true,
    addDefaultPage: false,
  });
};

/**
 * Main compression engine with multi-stage evaluation and safety fallback.
 * 
 * 1. Executes structural stream compaction.
 * 2. If in browser environment, attempts raster downsampling.
 * 3. Compares all generated candidates against the original byte length.
 * 4. Ensures output size is NEVER larger than the original input file.
 */
export const compressPdfCore = async (
  arrayBuffer: ArrayBuffer,
  tier: CompressionTier,
  onProgress?: (current: number, total: number, percent: number) => void
): Promise<CompressionResult> => {
  const originalLen = arrayBuffer.byteLength;
  const originalBytes = new Uint8Array(arrayBuffer.slice(0));

  let structuralBytes: Uint8Array | null = null;
  try {
    structuralBytes = await compressStructural(arrayBuffer, tier);
  } catch (err) {
    console.warn("Structural compaction error:", err);
  }

  let rasterBytes: Uint8Array | null = null;
  const isBrowser = typeof window !== "undefined" && typeof document !== "undefined";

  if (isBrowser) {
    try {
      const pdfjsLib = await getPdfJs();
      if (pdfjsLib) {
        const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
        const pdf = await loadingTask.promise;
        const numPages = pdf.numPages;

        const newPdfDoc = await PDFDocument.create();
        const scale = tier === "AGGRESSIVE" ? 1.0 : tier === "BALANCED" ? 1.3 : 1.6;
        const quality = tier === "AGGRESSIVE" ? 0.38 : tier === "BALANCED" ? 0.58 : 0.82;

        for (let pageNum = 1; pageNum <= numPages; pageNum++) {
          if (onProgress) {
            onProgress(pageNum, numPages, Math.round(((pageNum - 0.5) / numPages) * 100));
          }

          const page = await pdf.getPage(pageNum);
          const originalViewport = page.getViewport({ scale: 1.0 });
          const renderViewport = page.getViewport({ scale });

          const canvas = document.createElement("canvas");
          canvas.width = Math.floor(renderViewport.width);
          canvas.height = Math.floor(renderViewport.height);
          const ctx = canvas.getContext("2d");

          if (ctx) {
            ctx.fillStyle = "#ffffff";
            ctx.fillRect(0, 0, canvas.width, canvas.height);

            await page.render({
              canvasContext: ctx,
              viewport: renderViewport,
            }).promise;

            const jpegDataUrl = canvas.toDataURL("image/jpeg", quality);
            const base64Data = jpegDataUrl.split(",")[1];
            const imageBytes = Uint8Array.from(atob(base64Data), c => c.charCodeAt(0));

            const embeddedImage = await newPdfDoc.embedJpg(imageBytes);
            const newPage = newPdfDoc.addPage([originalViewport.width, originalViewport.height]);
            newPage.drawImage(embeddedImage, {
              x: 0,
              y: 0,
              width: originalViewport.width,
              height: originalViewport.height,
            });
          }
        }

        rasterBytes = await newPdfDoc.save({
          useObjectStreams: true,
          addDefaultPage: false,
        });
      }
    } catch (err) {
      console.warn("Rasterization skipped or encountered error:", err);
    }
  }

  if (onProgress) {
    onProgress(1, 1, 100);
  }

  // Evaluate candidates
  const structuralLen = structuralBytes ? structuralBytes.length : Infinity;
  const rasterLen = rasterBytes ? rasterBytes.length : Infinity;

  // Option 1: Raster produced a smaller file than both original and structural
  if (rasterBytes && rasterLen < originalLen && rasterLen <= structuralLen) {
    const savedBytes = originalLen - rasterLen;
    const compressionRatio = Math.round((savedBytes / originalLen) * 100);
    return {
      bytes: rasterBytes,
      originalSize: originalLen,
      compressedSize: rasterLen,
      savedBytes,
      compressionRatio,
      wasOriginalKept: false,
      methodUsed: "raster",
      note: `Raster compression applied (${tier})`,
    };
  }

  // Option 2: Structural compaction produced a smaller file than original
  if (structuralBytes && structuralLen < originalLen) {
    const savedBytes = originalLen - structuralLen;
    const compressionRatio = Math.round((savedBytes / originalLen) * 100);
    return {
      bytes: structuralBytes,
      originalSize: originalLen,
      compressedSize: structuralLen,
      savedBytes,
      compressionRatio,
      wasOriginalKept: false,
      methodUsed: "structural",
      note: rasterBytes
        ? "Lossless stream compression applied (raster avoided size inflation)"
        : "Lossless stream compression applied",
    };
  }

  // Option 3: Safety Fallback — neither method reduced file size
  return {
    bytes: originalBytes,
    originalSize: originalLen,
    compressedSize: originalLen,
    savedBytes: 0,
    compressionRatio: 0,
    wasOriginalKept: true,
    methodUsed: "original_fallback",
    note: "Compression not beneficial for this file — original kept",
  };
};

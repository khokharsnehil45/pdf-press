import test from "node:test";
import assert from "node:assert/strict";
import { PDFDocument, StandardFonts, rgb } from "pdf-lib";
import {
  compressPdfCore,
  compressStructural,
  formatBytes,
  formatSavingsDisplay,
  calculateAggregateStats,
  CompressionTier,
} from "../lib/compressionEngine.js";

// Helper to create a small text/vector PDF (similar to 8 KB text PDF)
async function createSampleTextPdf(): Promise<ArrayBuffer> {
  const pdfDoc = await PDFDocument.create();
  const timesRomanFont = await pdfDoc.embedFont(StandardFonts.TimesRoman);
  const page = pdfDoc.addPage([595.28, 841.89]); // A4

  const { width, height } = page.getSize();
  const fontSize = 12;

  page.drawText("PDF-PRESS REGRESSION TEST DOCUMENT", {
    x: 50,
    y: height - 50,
    size: 16,
    font: timesRomanFont,
    color: rgb(0, 0, 0),
  });

  page.drawLine({
    start: { x: 50, y: height - 60 },
    end: { x: width - 50, y: height - 60 },
    thickness: 1,
    color: rgb(0.2, 0.2, 0.2),
  });

  const paragraph = 
    "This is a sample small text-heavy PDF document created to verify that compression presets " +
    "(Balanced, Max Compression, and High Quality) never inflate file size when processing text or vector graphics. " +
    "The compression pipeline must either achieve a smaller file or safely fall back to the original unmodified bytes.";

  page.drawText(paragraph, {
    x: 50,
    y: height - 100,
    size: fontSize,
    font: timesRomanFont,
    maxWidth: width - 100,
    lineHeight: 16,
  });

  const pdfBytes = await pdfDoc.save();
  const buffer = new ArrayBuffer(pdfBytes.byteLength);
  new Uint8Array(buffer).set(pdfBytes);
  return buffer;
}

test("Regression Test: Small text/vector PDF output size is never larger than input across all presets", async () => {
  const samplePdfBuffer = await createSampleTextPdf();
  const originalSize = samplePdfBuffer.byteLength;
  assert.ok(originalSize > 0, "Sample PDF should be non-empty");

  const presets: CompressionTier[] = ["BALANCED", "AGGRESSIVE", "LOSSLESS"];

  for (const preset of presets) {
    const result = await compressPdfCore(samplePdfBuffer, preset);

    // 1. Output size must NEVER be larger than input size
    assert.ok(
      result.compressedSize <= originalSize,
      `Preset ${preset} caused size inflation: ${result.compressedSize} > ${originalSize}`
    );

    // 2. Saved bytes must never be negative
    assert.ok(
      result.savedBytes >= 0,
      `Preset ${preset} produced negative savedBytes: ${result.savedBytes}`
    );

    // 3. Compression ratio must be >= 0
    assert.ok(
      result.compressionRatio >= 0,
      `Preset ${preset} produced negative compressionRatio: ${result.compressionRatio}`
    );

    // 4. Output byte length must equal compressedSize
    assert.equal(result.bytes.length, result.compressedSize);

    // 5. If original was kept, bytes must match original length and note must be set
    if (result.wasOriginalKept) {
      assert.equal(result.compressedSize, originalSize);
      assert.equal(result.savedBytes, 0);
      assert.equal(result.compressionRatio, 0);
      assert.match(result.note, /original kept/i);
    }
  }
});

test("Regression Test: formatSavingsDisplay never shows -0% or misleading negative values", () => {
  // Case: No reduction / original kept
  const zeroSaved = formatSavingsDisplay(10000, 10000, true);
  assert.equal(zeroSaved.text, "0% (Original kept)");
  assert.notEqual(zeroSaved.text, "-0%");

  // Case: Same size without explicit flag
  const sameSize = formatSavingsDisplay(8478, 8478);
  assert.equal(sameSize.text, "0% (Original kept)");
  assert.notEqual(sameSize.text, "-0%");

  // Case: Positive reduction (50% reduction)
  const reduced = formatSavingsDisplay(10000, 5000);
  assert.equal(reduced.text, "-50%");

  // Case: Negative reduction (hypothetical bloated file)
  const bloated = formatSavingsDisplay(8478, 127416);
  assert.equal(bloated.text, "+1403% (grew)");
  assert.notEqual(bloated.text, "-0%");
  assert.notEqual(bloated.text, "-1403%");
  assert.equal(bloated.isNegative, true);
});

test("Regression Test: calculateAggregateStats properly calculates before/after sizes without negative ratio bloat", () => {
  // Scenario 1: Mixed jobs with some compressed and some original kept
  const jobs = [
    { originalSize: 100000, compressedSize: 40000, wasOriginalKept: false }, // 60k saved (60%)
    { originalSize: 8478, compressedSize: 8478, wasOriginalKept: true },     // 0 saved (0%)
  ];

  const stats = calculateAggregateStats(jobs);
  assert.equal(stats.totalOriginal, 108478);
  assert.equal(stats.totalCompressed, 48478);
  assert.equal(stats.totalSaved, 60000);
  assert.equal(stats.avgRatio, 55); // 60000 / 108478 = 55.3%
  assert.equal(stats.ratioDisplay, "55%");

  // Scenario 2: All jobs had original kept
  const allKeptJobs = [
    { originalSize: 8478, compressedSize: 8478, wasOriginalKept: true },
    { originalSize: 5000, compressedSize: 5000, wasOriginalKept: true },
  ];
  const allKeptStats = calculateAggregateStats(allKeptJobs);
  assert.equal(allKeptStats.totalSaved, 0);
  assert.equal(allKeptStats.avgRatio, 0);
  assert.equal(allKeptStats.ratioDisplay, "0%");
  assert.notEqual(allKeptStats.ratioDisplay, "-0%");
  assert.equal(allKeptStats.savingsDisplay, "0 B");

  // Scenario 3: Hypothetical growth test to verify no raw negative percentage like "-1403%"
  const grewJobs = [
    { originalSize: 8478, compressedSize: 127416, wasOriginalKept: false }
  ];
  const grewStats = calculateAggregateStats(grewJobs);
  assert.equal(grewStats.ratioDisplay, "+1403% (grew)");
  assert.notEqual(grewStats.ratioDisplay, "-1403%");
  assert.match(grewStats.savingsDisplay, /\+.*\(grew\)/);
});

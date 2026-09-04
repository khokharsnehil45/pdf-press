// Dedicated Web Worker for Off-Thread PDF Compression
importScripts('https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.min.js');
importScripts('https://unpkg.com/pdf-lib@1.17.1/dist/pdf-lib.min.js');

pdfjsLib.GlobalWorkerOptions.workerSrc = 'https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/pdf.worker.min.js';

self.onmessage = async function(e) {
  const { id, arrayBuffer, tier } = e.data;

  try {
    const loadingTask = pdfjsLib.getDocument({ data: arrayBuffer.slice(0) });
    const pdf = await loadingTask.promise;
    const numPages = pdf.numPages;

    const newPdfDoc = await PDFLib.PDFDocument.create();

    const scale = tier === "AGGRESSIVE" ? 1.0 : tier === "BALANCED" ? 1.3 : 1.6;
    const quality = tier === "AGGRESSIVE" ? 0.40 : tier === "BALANCED" ? 0.60 : 0.85;

    for (let pageNum = 1; pageNum <= numPages; pageNum++) {
      // Send live page progress back to UI
      self.postMessage({
        type: 'PROGRESS',
        id,
        currentPage: pageNum,
        totalPages: numPages,
        percentage: Math.round(((pageNum - 0.5) / numPages) * 100)
      });

      const page = await pdf.getPage(pageNum);
      const originalViewport = page.getViewport({ scale: 1.0 });
      const renderViewport = page.getViewport({ scale });

      // Use OffscreenCanvas in Web Worker
      const canvas = new OffscreenCanvas(Math.floor(renderViewport.width), Math.floor(renderViewport.height));
      const ctx = canvas.getContext('2d');

      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, canvas.width, canvas.height);

      await page.render({
        canvasContext: ctx,
        viewport: renderViewport
      }).promise;

      // Convert canvas to Blob
      const blob = await canvas.convertToBlob({ type: 'image/jpeg', quality });
      const imgBuffer = await blob.arrayBuffer();
      const imageBytes = new Uint8Array(imgBuffer);

      const embeddedImage = await newPdfDoc.embedJpg(imageBytes);
      const newPage = newPdfDoc.addPage([originalViewport.width, originalViewport.height]);
      newPage.drawImage(embeddedImage, {
        x: 0,
        y: 0,
        width: originalViewport.width,
        height: originalViewport.height
      });
    }

    self.postMessage({
      type: 'PROGRESS',
      id,
      currentPage: numPages,
      totalPages: numPages,
      percentage: 100
    });

    const compressedBytes = await newPdfDoc.save({
      useObjectStreams: true,
      addDefaultPage: false
    });

    const originalLen = arrayBuffer.byteLength;
    let ratio = Math.round((1 - (compressedBytes.length / originalLen)) * 100);
    if (ratio < 0) ratio = 0;

    self.postMessage({
      type: 'SUCCESS',
      id,
      compressedBytes,
      actualRatio: ratio
    }, [compressedBytes.buffer]);

  } catch (error) {
    self.postMessage({
      type: 'ERROR',
      id,
      error: error.message || 'Worker compression failed'
    });
  }
};

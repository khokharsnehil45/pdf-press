"use client";
/* eslint-disable @next/next/no-img-element */

import React, { useEffect, useRef, useState } from "react";
import {
  Boxes,
  Download,
  FileCheck,
  FileImage,
  Gauge,
  Image as ImageIcon,
  Layers,
  Moon,
  RefreshCw,
  ShieldCheck,
  Sliders,
  Sparkles,
  Sun,
  Trash2,
  TrendingDown,
  UploadCloud,
  Zap,
} from "lucide-react";

type Theme = "dark" | "light";
type PresetKey = "SHRINK" | "BALANCED" | "DETAIL";
type OutputFormat = "AUTO" | "WEBP" | "JPEG" | "PNG";
type JobStatus = "QUEUED" | "PROCESSING" | "READY" | "ERROR";

interface ImageJob {
  id: string;
  name: string;
  originalSize: number;
  compressedSize: number | null;
  savingsPercent: number | null;
  status: JobStatus;
  preset: PresetKey;
  outputFormat: OutputFormat;
  resizePercent: number;
  quality: number;
  originalWidth: number;
  originalHeight: number;
  outputWidth?: number;
  outputHeight?: number;
  currentStep?: string;
  progressPercent?: number;
  originalBlob: Blob;
  originalUrl: string;
  compressedBlob: Blob | null;
  downloadUrl: string | null;
  errorMessage?: string;
}

const PRESET_CONFIG: Record<
  PresetKey,
  {
    label: string;
    badge: string;
    description: string;
    scale: number;
    quality: number;
    estimatedSaved: number;
    ratioCopy: string;
  }
> = {
  SHRINK: {
    label: "MAX SHRINK",
    badge: "SMALLEST FILES",
    description: "Aggressive downscale and re-encode for maximum savings.",
    scale: 72,
    quality: 62,
    estimatedSaved: 72,
    ratioCopy: "~55% - 80% size drop",
  },
  BALANCED: {
    label: "BALANCED",
    badge: "RECOMMENDED",
    description: "Best default for photos, screenshots, and mixed batches.",
    scale: 86,
    quality: 78,
    estimatedSaved: 52,
    ratioCopy: "~35% - 65% size drop",
  },
  DETAIL: {
    label: "HIGH DETAIL",
    badge: "BEST QUALITY",
    description: "Preserve more texture and dimensions for cleaner output.",
    scale: 100,
    quality: 90,
    estimatedSaved: 28,
    ratioCopy: "~15% - 40% size drop",
  },
};

const OUTPUT_FORMATS: Array<{
  id: OutputFormat;
  label: string;
  description: string;
}> = [
  { id: "AUTO", label: "AUTO", description: "Smart format per input type" },
  { id: "WEBP", label: "WEBP", description: "Strong compression with alpha support" },
  { id: "JPEG", label: "JPEG", description: "Best for photos and flattened exports" },
  { id: "PNG", label: "PNG", description: "Lossless-style output for crisp graphics" },
];

const SUPPORTED_IMAGE_EXTENSIONS = new Set([
  "jpg",
  "jpeg",
  "png",
  "webp",
  "avif",
  "gif",
  "bmp",
  "ico",
]);

const MIME_TO_EXTENSION: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/webp": "webp",
  "image/png": "png",
  "image/avif": "avif",
  "image/gif": "gif",
};

function formatBytes(bytes: number) {
  if (bytes <= 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(k)), sizes.length - 1);
  return `${parseFloat((bytes / Math.pow(k, index)).toFixed(2))} ${sizes[index]}`;
}

function formatDimension(value: number) {
  return `${Math.max(1, Math.round(value))} px`;
}

function clamp(value: number, min: number, max: number) {
  return Math.min(max, Math.max(min, value));
}

function getExtensionFromName(name: string) {
  const parts = name.toLowerCase().split(".");
  return parts.length > 1 ? parts.pop() ?? "" : "";
}

function getBaseName(name: string) {
  const index = name.lastIndexOf(".");
  return index === -1 ? name : name.slice(0, index);
}

function mimeTypeToExtension(mime: string) {
  return MIME_TO_EXTENSION[mime] ?? "img";
}

function isSupportedImageFile(file: File) {
  if (file.type.startsWith("image/")) return true;
  return SUPPORTED_IMAGE_EXTENSIONS.has(getExtensionFromName(file.name));
}

export default function ImagePressApp() {
  const [theme, setTheme] = useState<Theme>("dark");
  const [jobs, setJobs] = useState<ImageJob[]>([]);
  const [selectedPreset, setSelectedPreset] = useState<PresetKey>("BALANCED");
  const [resizePercent, setResizePercent] = useState<number>(PRESET_CONFIG.BALANCED.scale);
  const [quality, setQuality] = useState<number>(PRESET_CONFIG.BALANCED.quality);
  const [outputFormat, setOutputFormat] = useState<OutputFormat>("AUTO");
  const [isDragging, setIsDragging] = useState(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const jobsRef = useRef<ImageJob[]>([]);
  const mimeSupportRef = useRef<Record<string, boolean>>({});

  useEffect(() => {
    jobsRef.current = jobs;
  }, [jobs]);

  // Unregister old Service Workers and purge old caches so mobile browsers completely clear the PWA state
  useEffect(() => {
    if (typeof window !== "undefined" && "serviceWorker" in navigator) {
      navigator.serviceWorker.getRegistrations().then((registrations) => {
        for (const registration of registrations) {
          registration.unregister();
        }
      });
      if ("caches" in window) {
        caches.keys().then((names) => {
          for (const name of names) {
            caches.delete(name);
          }
        });
      }
    }
  }, []);

  const updateQueuedJobs = (updater: (job: ImageJob) => ImageJob) => {
    setJobs((prev) => prev.map((job) => (job.status === "QUEUED" ? updater(job) : job)));
  };

  const setPreset = (preset: PresetKey) => {
    setSelectedPreset(preset);
    setResizePercent(PRESET_CONFIG[preset].scale);
    setQuality(PRESET_CONFIG[preset].quality);
    updateQueuedJobs((job) => ({
      ...job,
      preset,
      resizePercent: PRESET_CONFIG[preset].scale,
      quality: PRESET_CONFIG[preset].quality,
    }));
  };

  const resolveOutputMime = (inputType: string, format: OutputFormat) => {
    const canvas = document.createElement("canvas");
    const supports = (mime: string) => {
      if (mimeSupportRef.current[mime] !== undefined) {
        return mimeSupportRef.current[mime];
      }
      const supported = canvas.toDataURL(mime).startsWith(`data:${mime}`);
      mimeSupportRef.current[mime] = supported;
      return supported;
    };

    if (format === "JPEG") return "image/jpeg";
    if (format === "PNG") return "image/png";
    if (format === "WEBP") return supports("image/webp") ? "image/webp" : "image/jpeg";

    if (inputType === "image/jpeg" || inputType === "image/jpg") {
      return "image/jpeg";
    }
    if (inputType === "image/png" || inputType === "image/gif" || inputType === "image/avif") {
      return supports("image/webp") ? "image/webp" : "image/jpeg";
    }
    return supports("image/webp") ? "image/webp" : "image/jpeg";
  };

  const canvasToBlob = (canvas: HTMLCanvasElement, mime: string, qualityValue: number) =>
    new Promise<Blob>((resolve, reject) => {
      canvas.toBlob(
        (blob) => {
          if (!blob) {
            reject(new Error("Canvas encoding failed"));
            return;
          }
          resolve(blob);
        },
        mime,
        mime === "image/png" ? undefined : qualityValue
      );
    });

  const loadImage = (src: string) =>
    new Promise<HTMLImageElement>((resolve, reject) => {
      const image = new window.Image();
      image.decoding = "async";
      image.onload = () => resolve(image);
      image.onerror = () => reject(new Error("Could not decode image"));
      image.src = src;
    });

  const getEstimatedSavings = (job: Pick<ImageJob, "preset" | "resizePercent" | "quality" | "outputFormat" | "originalSize" | "originalBlob">) => {
    const preset = PRESET_CONFIG[job.preset];
    let estimate = preset.estimatedSaved;

    estimate += (100 - job.resizePercent) * 0.35;
    estimate += (100 - job.quality) * 0.18;

    if (job.outputFormat === "WEBP") estimate += 10;
    if (job.outputFormat === "JPEG") estimate += 6;
    if (job.outputFormat === "PNG") estimate -= 20;

    const type = job.originalBlob.type || "";
    if (type.includes("png")) estimate += 4;
    if (type.includes("jpeg") || type.includes("jpg")) estimate -= 4;
    if (type.includes("gif") || type.includes("avif")) estimate += 6;

    return clamp(Math.round(estimate), 5, 92);
  };

  const compressImageCore = async (
    sourceUrl: string,
    inputType: string,
    originalSize: number,
    settings: {
      preset: PresetKey;
      resizePercent: number;
      quality: number;
      outputFormat: OutputFormat;
    },
    onProgress: (current: number, total: number, percent: number, step: string) => void
  ) => {
    onProgress(0, 4, 10, "Decoding image");

    const image = await loadImage(sourceUrl);
    const outputWidth = Math.max(1, Math.round(image.naturalWidth * (settings.resizePercent / 100)));
    const outputHeight = Math.max(1, Math.round(image.naturalHeight * (settings.resizePercent / 100)));

    onProgress(1, 4, 40, "Resizing canvas");

    const canvas = document.createElement("canvas");
    canvas.width = outputWidth;
    canvas.height = outputHeight;

    const ctx = canvas.getContext("2d");
    if (!ctx) {
      throw new Error("Canvas context unavailable");
    }

    ctx.imageSmoothingEnabled = true;
    ctx.imageSmoothingQuality = "high";

    const outputMime = resolveOutputMime(inputType, settings.outputFormat);
    const needsBackground = outputMime === "image/jpeg";

    if (needsBackground) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.width, canvas.height);
    }

    ctx.drawImage(image, 0, 0, outputWidth, outputHeight);
    onProgress(2, 4, 72, "Encoding output");

    const encodedBlob = await canvasToBlob(canvas, outputMime, settings.quality / 100);
    const bytes = new Uint8Array(await encodedBlob.arrayBuffer());

    onProgress(3, 4, 92, "Finalizing");

    const actualRatio = Math.max(0, Math.round((1 - bytes.length / Math.max(1, originalSize)) * 100));

    return {
      bytes,
      blob: encodedBlob,
      outputWidth,
      outputHeight,
      actualRatio,
    };
  };

  const inspectImage = async (file: File) => {
    const originalUrl = URL.createObjectURL(file);
    try {
      const image = await loadImage(originalUrl);
      return {
        originalUrl,
        width: image.naturalWidth,
        height: image.naturalHeight,
      };
    } catch (error) {
      URL.revokeObjectURL(originalUrl);
      throw error;
    }
  };

  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const nextJobs: ImageJob[] = [];

    for (let index = 0; index < files.length; index += 1) {
      const file = files[index];
      if (!isSupportedImageFile(file)) {
        alert(`"${file.name}" is not a supported image file.`);
        continue;
      }

      try {
        const { originalUrl, width, height } = await inspectImage(file);
        nextJobs.push({
          id: `job_${Date.now()}_${index}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          originalSize: file.size,
          compressedSize: null,
          savingsPercent: null,
          status: "QUEUED",
          preset: selectedPreset,
          outputFormat,
          resizePercent,
          quality,
          originalWidth: width,
          originalHeight: height,
          currentStep: "Queued",
          progressPercent: 0,
          originalBlob: file,
          originalUrl,
          compressedBlob: null,
          downloadUrl: null,
        });
      } catch (error) {
        console.error("Error inspecting image:", error);
        alert(`"${file.name}" could not be read.`);
      }
    }

    if (nextJobs.length > 0) {
      setJobs((prev) => [...prev, ...nextJobs]);
    }
  };

  const compressSingleJob = async (job: ImageJob, overrideSettings?: {
    preset: PresetKey;
    resizePercent: number;
    quality: number;
    outputFormat: OutputFormat;
  }) => {
    const settings = overrideSettings ?? {
      preset: job.preset,
      resizePercent: job.resizePercent,
      quality: job.quality,
      outputFormat: job.outputFormat,
    };

    setJobs((prev) =>
      prev.map((entry) =>
        entry.id === job.id
          ? {
              ...entry,
              status: "PROCESSING",
              preset: settings.preset,
              resizePercent: settings.resizePercent,
              quality: settings.quality,
              outputFormat: settings.outputFormat,
              progressPercent: 8,
              currentStep: "Starting",
            }
          : entry
      )
    );

    try {
      const { bytes, blob, outputWidth, outputHeight, actualRatio } = await compressImageCore(
        job.originalUrl,
        job.originalBlob.type,
        job.originalSize,
        settings,
        (current, total, percent, step) => {
          setJobs((prev) =>
            prev.map((entry) =>
              entry.id === job.id
                ? {
                    ...entry,
                    currentStep: step,
                    progressPercent: percent,
                  }
                : entry
            )
          );
        }
      );

      const downloadUrl = URL.createObjectURL(blob);

      setJobs((prev) =>
        prev.map((entry) =>
          entry.id === job.id
            ? {
                ...entry,
                status: "READY",
                compressedSize: bytes.length,
                savingsPercent: actualRatio,
                compressedBlob: blob,
                downloadUrl,
                outputWidth,
                outputHeight,
                progressPercent: 100,
                currentStep: "Ready",
              }
            : entry
        )
      );
    } catch (error) {
      console.error("Compression error:", error);
      setJobs((prev) =>
        prev.map((entry) =>
          entry.id === job.id
            ? {
                ...entry,
                status: "ERROR",
                errorMessage: error instanceof Error ? error.message : "Unable to process image.",
                currentStep: "Error",
                progressPercent: 0,
              }
            : entry
        )
      );
    }
  };

  const handleCompressAll = async () => {
    const queued = jobs.filter((job) => job.status === "QUEUED");
    if (queued.length === 0) return;

    setIsBatchProcessing(true);
    for (const job of queued) {
      await compressSingleJob(job, {
        preset: selectedPreset,
        resizePercent,
        quality,
        outputFormat,
      });
    }
    setIsBatchProcessing(false);
  };

  const handleDownload = (job: ImageJob) => {
    if (!job.downloadUrl) return;
    const a = document.createElement("a");
    const extension = mimeTypeToExtension(job.compressedBlob?.type ?? "image/jpeg");
    a.href = job.downloadUrl;
    a.download = `${getBaseName(job.name)}_IMAGE-PRESS.${extension}`;
    a.click();
  };

  const revokeJobResources = (job: ImageJob) => {
    const seen = new Set<string>();
    if (job.originalUrl && !seen.has(job.originalUrl)) {
      URL.revokeObjectURL(job.originalUrl);
      seen.add(job.originalUrl);
    }
    if (job.downloadUrl && !seen.has(job.downloadUrl)) {
      URL.revokeObjectURL(job.downloadUrl);
      seen.add(job.downloadUrl);
    }
  };

  const handleRemove = (jobId: string) => {
    setJobs((prev) => {
      const target = prev.find((job) => job.id === jobId);
      if (target) {
        revokeJobResources(target);
      }
      return prev.filter((job) => job.id !== jobId);
    });
  };

  const handleClearAll = () => {
    setJobs((prev) => {
      prev.forEach((job) => revokeJobResources(job));
      return [];
    });
  };

  const totalOriginalBytes = jobs.reduce((sum, job) => sum + job.originalSize, 0);
  const readyJobs = jobs.filter((job) => job.status === "READY");
  const actualSavedBytes = readyJobs.reduce(
    (sum, job) => sum + (job.originalSize - (job.compressedSize ?? job.originalSize)),
    0
  );
  const overallEstimate = clamp(
    Math.round(jobs.reduce((sum, job) => sum + (job.status === "READY" ? 0 : getEstimatedSavings(job)), 0) / Math.max(1, jobs.length)),
    5,
    92
  );

  const totalEstimatedSavedBytes = jobs.reduce((sum, job) => {
    if (job.status === "READY") {
      return sum + (job.originalSize - (job.compressedSize ?? job.originalSize));
    }
    const savedPercent = getEstimatedSavings(job);
    return sum + Math.round(job.originalSize * (savedPercent / 100));
  }, 0);

  const textPrimary = theme === "dark" ? "text-neutral-100" : "text-neutral-900";
  const textSecondary = theme === "dark" ? "text-neutral-400" : "text-neutral-700";
  const textMuted = theme === "dark" ? "text-neutral-500" : "text-neutral-600";

  return (
    <div
      className={`min-h-screen flex flex-col font-mono select-none transition-colors duration-200 ${
        theme === "dark" ? "bg-grid-pattern-dark text-[#ecebe6]" : "bg-grid-pattern-light text-[#111827]"
      }`}
    >
      <header
        className={`h-14 border-b px-3 sm:px-6 flex items-center justify-between z-30 ${
          theme === "dark" ? "bg-[#181816]/95 border-[#383733]" : "bg-white/95 border-[#d4d2c7]"
        }`}
      >
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-amber-500 text-black flex items-center justify-center font-black text-xs shadow">
            <ImageIcon className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`font-black text-xs sm:text-sm tracking-wider uppercase ${textPrimary}`}>IMAGE-PRESS</span>
              <span
                className={`text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 border ${
                  theme === "dark" ? "bg-[#262624] text-amber-400 border-amber-500/30" : "bg-amber-100 text-amber-800 border-amber-300"
                }`}
              >
                CLIENT OFFLINE
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          <button
            onClick={() => setTheme(theme === "dark" ? "light" : "dark")}
            className={`p-2 border transition cursor-pointer ${
              theme === "dark" ? "border-[#383733] bg-[#1c1c1a] text-amber-400" : "border-[#d4d2c7] bg-neutral-100 text-neutral-900 hover:bg-neutral-200"
            }`}
            title="Toggle Theme"
          >
            {theme === "dark" ? <Sun className="w-4 h-4" /> : <Moon className="w-4 h-4" />}
          </button>
        </div>
      </header>

      <main className="flex-1 px-3 py-3 sm:px-6 sm:py-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full">
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2 sm:gap-3">
          <div className={`p-3 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"}`}>
            <div className={`text-[9px] sm:text-[10px] uppercase font-bold flex items-center justify-between ${textSecondary}`}>
              <span>IMAGES</span>
              <Layers className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className={`text-lg sm:text-2xl font-black font-mono mt-1 ${textPrimary}`}>
              {jobs.length} <span className={`text-xs font-normal ${textMuted}`}>Files</span>
            </div>
          </div>

          <div className={`p-3 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"}`}>
            <div className={`text-[9px] sm:text-[10px] uppercase font-bold flex items-center justify-between ${textSecondary}`}>
              <span>INPUT SIZE</span>
              <Boxes className="w-3.5 h-3.5 text-sky-500" />
            </div>
            <div className={`text-lg sm:text-2xl font-black font-mono mt-1 ${textPrimary}`}>{formatBytes(totalOriginalBytes)}</div>
          </div>

          <div className={`p-3 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"}`}>
            <div className={`text-[9px] sm:text-[10px] uppercase font-bold flex items-center justify-between ${textSecondary}`}>
              <span>{readyJobs.length > 0 ? "ACTUAL SAVINGS" : "EST. SAVINGS"}</span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              {readyJobs.length > 0 ? formatBytes(actualSavedBytes) : formatBytes(totalEstimatedSavedBytes)}
            </div>
          </div>

          <div className={`p-3 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"}`}>
            <div className={`text-[9px] sm:text-[10px] uppercase font-bold flex items-center justify-between ${textSecondary}`}>
              <span>{readyJobs.length > 0 ? "AVG RATIO" : "EST. RATIO"}</span>
              <Gauge className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
              {readyJobs.length > 0
                ? `${Math.round((actualSavedBytes / Math.max(1, totalOriginalBytes)) * 100)}%`
                : `~${overallEstimate}%`}
            </div>
          </div>
        </div>

        <div className={`p-3.5 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"} space-y-3`}>
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <span className={`text-xs font-black uppercase flex items-center gap-1.5 ${textPrimary}`}>
              <Sliders className="w-3.5 h-3.5 text-amber-500" />
              COMPRESSION PRESET
            </span>
            {totalOriginalBytes > 0 && (
              <span
                className={`text-[10px] sm:text-[11px] font-mono font-bold px-2 py-0.5 border ${
                  theme === "dark" ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : "text-amber-800 bg-amber-100 border-amber-300"
                }`}
              >
                Est. Output: {formatBytes(Math.max(1024, totalOriginalBytes - totalEstimatedSavedBytes))}
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-2 sm:gap-3">
            {(["SHRINK", "BALANCED", "DETAIL"] as PresetKey[]).map((preset) => {
              const config = PRESET_CONFIG[preset];
              const isSelected = selectedPreset === preset;

              return (
                <button
                  key={preset}
                  onClick={() => setPreset(preset)}
                  className={`p-3 border-2 text-left flex flex-col justify-between gap-2.5 transition cursor-pointer relative ${
                    isSelected
                      ? theme === "dark"
                        ? "border-amber-500 bg-amber-500/10 text-white shadow-lg shadow-amber-500/5"
                        : "border-amber-600 bg-amber-50 text-neutral-900 shadow-sm"
                      : theme === "dark"
                        ? "border-[#383733] bg-[#141412] hover:border-neutral-500"
                        : "border-[#d4d2c7] bg-[#fbfbfa] hover:border-neutral-800"
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between mb-1">
                      <span className={`text-xs font-black uppercase tracking-wide ${textPrimary}`}>{config.label}</span>
                      {isSelected ? (
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-amber-500 text-black uppercase">ACTIVE</span>
                      ) : (
                        <span
                          className={`text-[9px] font-bold px-1.5 py-0.5 uppercase border ${
                            theme === "dark"
                              ? "bg-neutral-800 text-neutral-400 border-neutral-700"
                              : "bg-neutral-200 text-neutral-800 border-neutral-300"
                          }`}
                        >
                          {config.badge}
                        </span>
                      )}
                    </div>
                    <p className={`text-[10px] sm:text-[11px] leading-snug font-medium ${textSecondary}`}>{config.description}</p>
                  </div>

                  <div
                    className={`p-1.5 sm:p-2 border text-[10px] sm:text-[11px] font-mono flex items-center justify-between ${
                      isSelected
                        ? theme === "dark"
                          ? "border-amber-500/40 bg-amber-500/15 text-amber-200"
                          : "border-amber-400 bg-amber-100 text-amber-900 font-bold"
                        : theme === "dark"
                          ? "border-[#262624] bg-[#181816]/70 text-neutral-400"
                          : "border-neutral-200 bg-white text-neutral-700"
                    }`}
                  >
                    <div className="flex items-center gap-1">
                      <TrendingDown className={`w-3.5 h-3.5 ${isSelected ? (theme === "dark" ? "text-amber-400" : "text-amber-700") : textMuted}`} />
                      <span className="font-bold">{config.ratioCopy}</span>
                    </div>
                    {totalOriginalBytes > 0 && (
                      <span className={isSelected ? (theme === "dark" ? "text-emerald-400" : "text-emerald-700") : textPrimary}>
                        ~{formatBytes(Math.round(totalOriginalBytes * (config.estimatedSaved / 100)))}
                      </span>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        <div className={`p-3.5 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"} space-y-4`}>
          <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
            <div className="space-y-2">
              <div className={`flex items-center justify-between text-xs font-black uppercase ${textPrimary}`}>
                <span>Resize</span>
                <span className={theme === "dark" ? "text-amber-400" : "text-amber-700"}>{resizePercent}%</span>
              </div>
              <input
                type="range"
                min={25}
                max={100}
                value={resizePercent}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setResizePercent(value);
                  updateQueuedJobs((job) => ({ ...job, resizePercent: value }));
                }}
                className="w-full accent-amber-500"
              />
              <div className={`text-[10px] sm:text-[11px] leading-snug ${textSecondary}`}>
                Smaller values cut file size harder. Keep 85-100 for screen-ready exports.
              </div>
            </div>

            <div className="space-y-2">
              <div className={`flex items-center justify-between text-xs font-black uppercase ${textPrimary}`}>
                <span>Quality</span>
                <span className={theme === "dark" ? "text-amber-400" : "text-amber-700"}>{quality}%</span>
              </div>
              <input
                type="range"
                min={40}
                max={100}
                value={quality}
                onChange={(event) => {
                  const value = Number(event.target.value);
                  setQuality(value);
                  updateQueuedJobs((job) => ({ ...job, quality: value }));
                }}
                className="w-full accent-amber-500"
              />
              <div className={`text-[10px] sm:text-[11px] leading-snug ${textSecondary}`}>
                Lower quality gives smaller files. Higher values keep gradients and photo detail.
              </div>
            </div>
          </div>

          <div className="space-y-2">
            <div className={`flex items-center justify-between text-xs font-black uppercase ${textPrimary}`}>
              <span>Output Format</span>
              <span className={theme === "dark" ? "text-amber-400" : "text-amber-700"}>{outputFormat}</span>
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
              {OUTPUT_FORMATS.map((format) => {
                const isSelected = outputFormat === format.id;
                return (
                  <button
                    key={format.id}
                    onClick={() => {
                      setOutputFormat(format.id);
                      updateQueuedJobs((job) => ({ ...job, outputFormat: format.id }));
                    }}
                    className={`p-3 border text-left transition cursor-pointer ${
                      isSelected
                        ? theme === "dark"
                          ? "border-amber-500 bg-amber-500/10 text-white"
                          : "border-amber-600 bg-amber-50 text-neutral-900"
                        : theme === "dark"
                          ? "border-[#383733] bg-[#141412] hover:border-neutral-500"
                          : "border-[#d4d2c7] bg-[#fbfbfa] hover:border-neutral-800"
                    }`}
                  >
                    <div className={`text-xs font-black ${textPrimary}`}>{format.label}</div>
                    <div className={`mt-1 text-[10px] leading-snug ${textSecondary}`}>{format.description}</div>
                  </button>
                );
              })}
            </div>
          </div>
        </div>

        <div
          onDragOver={(event) => {
            event.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(event) => {
            event.preventDefault();
            setIsDragging(false);
            handleFiles(event.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed p-5 sm:p-8 flex flex-col items-center justify-center gap-2.5 sm:gap-3 transition-all cursor-pointer ${
            isDragging
              ? "border-amber-500 bg-amber-500/10"
              : theme === "dark"
                ? "border-[#383733] bg-[#181816]/90 hover:border-amber-500/60 hover:bg-[#1f1e1c]"
                : "border-[#b8b5a8] bg-white hover:border-neutral-900 shadow-xs"
          }`}
        >
          <input
            type="file"
            ref={fileInputRef}
            multiple
            accept="image/*,.jpg,.jpeg,.png,.webp,.avif,.gif"
            className="hidden"
            onChange={(event) => handleFiles(event.target.files)}
          />

          <div
            className={`w-10 h-10 border flex items-center justify-center shadow ${
              theme === "dark" ? "bg-[#262624] border-[#383733] text-amber-400" : "bg-amber-100 border-amber-300 text-amber-700"
            }`}
          >
            <UploadCloud className="w-5 h-5" />
          </div>

          <div className="text-center space-y-1">
            <div className={`text-xs sm:text-sm font-black uppercase tracking-wider ${textPrimary}`}>TAP OR DROP IMAGES HERE</div>
            <p className={`text-[10px] sm:text-[11px] font-mono font-medium ${textSecondary}`}>
              Resize, compress, and strip metadata in the browser
            </p>
          </div>

          <div
            className={`flex items-center gap-1.5 pt-1 text-[9px] sm:text-[10px] font-mono font-bold ${
              theme === "dark" ? "text-emerald-400" : "text-emerald-700"
            }`}
          >
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>NO SERVER UPLOADS • 100% OFFLINE SAFE</span>
          </div>
        </div>

        {jobs.length > 0 && (
          <div className="space-y-3">
            <div className="flex items-start sm:items-center justify-between flex-col sm:flex-row gap-2 sm:gap-3">
              <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${textPrimary}`}>
                <FileCheck className="w-4 h-4 text-emerald-500" />
                QUEUE ({jobs.length})
              </span>

              <div className="hidden sm:flex items-center gap-2">
                <button
                  onClick={handleClearAll}
                  className={`px-2.5 py-1 sm:px-3 sm:py-1.5 border text-xs font-bold uppercase transition cursor-pointer ${
                    theme === "dark"
                      ? "border-[#383733] hover:border-rose-500 text-neutral-400 hover:text-rose-400"
                      : "border-neutral-300 bg-white hover:border-rose-500 text-neutral-700 hover:text-rose-600"
                  }`}
                >
                  Clear All
                </button>

                <button
                  onClick={handleCompressAll}
                  disabled={isBatchProcessing || jobs.every((job) => job.status === "READY")}
                  className={`flex items-center gap-1 px-3 py-1 sm:px-4 sm:py-1.5 font-black text-xs uppercase tracking-wider transition cursor-pointer shadow ${
                    isBatchProcessing || jobs.every((job) => job.status === "READY")
                      ? "bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed"
                      : "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20"
                  }`}
                >
                  {isBatchProcessing ? <RefreshCw className="w-3.5 h-3.5 animate-spin" /> : <Zap className="w-3.5 h-3.5" />}
                  <span>{isBatchProcessing ? "Processing..." : `Compress All (${selectedPreset})`}</span>
                </button>
              </div>
            </div>

            <div className="sm:hidden sticky bottom-2 z-20">
              <div className={`grid grid-cols-2 gap-2 p-2 border shadow-lg backdrop-blur-sm ${
                theme === "dark" ? "border-[#383733] bg-[#141412]/95" : "border-[#d4d2c7] bg-white/95"
              }`}>
                <button
                  onClick={handleClearAll}
                  className={`py-3 border text-xs font-black uppercase transition cursor-pointer ${
                    theme === "dark"
                      ? "border-[#383733] bg-[#1c1c1a] text-neutral-300"
                      : "border-neutral-300 bg-neutral-50 text-neutral-700"
                  }`}
                >
                  Clear All
                </button>
                <button
                  onClick={handleCompressAll}
                  disabled={isBatchProcessing || jobs.every((job) => job.status === "READY")}
                  className={`py-3 font-black text-xs uppercase tracking-wider transition cursor-pointer shadow ${
                    isBatchProcessing || jobs.every((job) => job.status === "READY")
                      ? "bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed"
                      : "bg-amber-500 hover:bg-amber-400 text-black"
                  }`}
                >
                  {isBatchProcessing ? "Working..." : "Compress All"}
                </button>
              </div>
            </div>

            <div className="block sm:hidden space-y-2.5">
              {jobs.map((job) => {
                const estimate = getEstimatedSavings(job);
                const estimatedOutput = Math.max(1024, job.originalSize - Math.round(job.originalSize * (estimate / 100)));

                return (
                  <div
                    key={job.id}
                    className={`p-3 border ${
                      theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"
                    } space-y-2`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <FileImage className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className={`text-xs font-bold truncate ${textPrimary}`} title={job.name}>
                          {job.name}
                        </span>
                      </div>
                      <button
                        onClick={() => handleRemove(job.id)}
                        className="text-neutral-500 hover:text-rose-500 p-1 cursor-pointer"
                        title="Remove Image"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    <div className="grid grid-cols-2 gap-2">
                      <div className={`p-2 border ${theme === "dark" ? "border-[#262624] bg-[#141412]" : "border-neutral-200 bg-neutral-50"}`}>
                        <div className={`text-[9px] font-black uppercase ${textMuted}`}>Original</div>
                        <div className="mt-2 aspect-square overflow-hidden border border-inherit bg-black/10">
                          <img src={job.originalUrl} alt={job.name} className="h-full w-full object-cover" />
                        </div>
                        <div className={`mt-2 text-[10px] ${textSecondary}`}>{formatDimension(job.originalWidth)} × {formatDimension(job.originalHeight)}</div>
                      </div>

                      <div className={`p-2 border ${theme === "dark" ? "border-[#262624] bg-[#141412]" : "border-neutral-200 bg-neutral-50"}`}>
                        <div className={`text-[9px] font-black uppercase ${textMuted}`}>Optimized</div>
                        <div className="mt-2 aspect-square overflow-hidden border border-inherit bg-black/10">
                          {job.status === "READY" && job.downloadUrl ? (
                            <img src={job.downloadUrl} alt={`${job.name} optimized`} className="h-full w-full object-cover" />
                          ) : (
                            <div className="h-full w-full flex items-center justify-center text-[10px] text-center px-2">
                              ~{Math.round(estimate)}% saved
                            </div>
                          )}
                        </div>
                        <div className={`mt-2 text-[10px] ${textSecondary}`}>
                          {job.status === "READY" && job.outputWidth && job.outputHeight
                            ? `${formatDimension(job.outputWidth)} × ${formatDimension(job.outputHeight)}`
                            : `${formatBytes(estimatedOutput)} est.`}
                        </div>
                      </div>
                    </div>

                    {job.status === "PROCESSING" && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-amber-500 font-bold">
                          <span>{job.currentStep || "Processing"}</span>
                          <span>{job.progressPercent || 10}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-neutral-800 border border-[#383733] overflow-hidden">
                          <div className="h-full bg-amber-500 transition-all duration-200" style={{ width: `${job.progressPercent || 10}%` }} />
                        </div>
                      </div>
                    )}

                    <div className="grid grid-cols-3 gap-1.5 text-[10px] font-mono p-2 border border-neutral-800/20 dark:border-neutral-800 bg-neutral-50 dark:bg-[#141412]">
                      <div>
                        <span className={`block ${textMuted}`}>Original</span>
                        <span className={`font-bold ${textSecondary}`}>{formatBytes(job.originalSize)}</span>
                      </div>
                      <div>
                        <span className={`block ${textMuted}`}>Optimized</span>
                        <span className={`font-bold ${job.status === "READY" ? (theme === "dark" ? "text-emerald-400" : "text-emerald-700") : textPrimary}`}>
                          {job.status === "READY" && job.compressedSize !== null ? formatBytes(job.compressedSize) : `~${formatBytes(estimatedOutput)}`}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`block ${textMuted}`}>Reduction</span>
                        <span className="font-black text-emerald-600 dark:text-emerald-400">
                          {job.status === "READY" && job.savingsPercent !== null ? `-${job.savingsPercent}%` : `~ -${estimate}%`}
                        </span>
                      </div>
                    </div>

                    <div className="flex items-center justify-between pt-1">
                      <span
                        className={`text-[9px] font-black px-1.5 py-0.5 border ${
                          job.status === "READY"
                            ? theme === "dark"
                              ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                              : "bg-emerald-100 text-emerald-800 border-emerald-300"
                            : job.status === "PROCESSING"
                              ? theme === "dark"
                                ? "bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse"
                                : "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
                              : theme === "dark"
                                ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                : "bg-neutral-100 text-neutral-800 border-neutral-300"
                        }`}
                      >
                        {job.status}
                      </span>

                      {job.status === "READY" ? (
                        <button
                          onClick={() => handleDownload(job)}
                          className="flex items-center gap-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] uppercase transition cursor-pointer shadow"
                        >
                          <Download className="w-3 h-3" />
                          <span>Download</span>
                        </button>
                      ) : (
                        <button
                          onClick={() =>
                            compressSingleJob(job, {
                              preset: selectedPreset,
                              resizePercent,
                              quality,
                              outputFormat,
                            })
                          }
                          disabled={job.status === "PROCESSING"}
                          className={`px-2.5 py-1 font-bold text-[11px] uppercase transition cursor-pointer shadow ${
                            job.status === "PROCESSING" ? "bg-neutral-700 text-neutral-400 cursor-not-allowed" : "bg-amber-500 hover:bg-amber-400 text-black"
                          }`}
                        >
                          {job.status === "PROCESSING" ? "Working..." : "Compress"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            <div className={`hidden sm:block border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"} overflow-x-auto`}>
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr
                    className={`border-b uppercase text-[10px] font-bold ${
                      theme === "dark" ? "border-[#383733] bg-[#141412] text-neutral-400" : "border-[#d4d2c7] bg-[#eeece2] text-neutral-800"
                    }`}
                  >
                    <th className="p-3.5">File</th>
                    <th className="p-3.5">Preview</th>
                    <th className="p-3.5 text-right">Original</th>
                    <th className="p-3.5 text-right">Optimized</th>
                    <th className="p-3.5 text-right">Savings</th>
                    <th className="p-3.5 text-center">Status / Progress</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className={theme === "dark" ? "divide-y divide-[#262624]" : "divide-y divide-neutral-200"}>
                  {jobs.map((job) => {
                    const estimate = getEstimatedSavings(job);
                    const estimatedOutput = Math.max(1024, job.originalSize - Math.round(job.originalSize * (estimate / 100)));

                    return (
                      <tr key={job.id} className={`transition-colors ${theme === "dark" ? "hover:bg-[#1f1e1c]/70" : "hover:bg-neutral-50"}`}>
                        <td className="p-3.5 align-top">
                          <div className={`font-bold flex items-center gap-2 ${textPrimary}`}>
                            <FileImage className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="truncate max-w-xs">{job.name}</span>
                          </div>
                          <div className={`text-[10px] mt-0.5 font-mono flex items-center gap-2 ${textMuted}`}>
                            <span>
                              {formatDimension(job.originalWidth)} × {formatDimension(job.originalHeight)}
                            </span>
                            <span>•</span>
                            <span className={theme === "dark" ? "text-amber-400/80 font-bold" : "text-amber-800 font-bold"}>{job.preset}</span>
                          </div>
                        </td>

                        <td className="p-3.5 align-top">
                          <div className={`w-20 aspect-square overflow-hidden border ${theme === "dark" ? "border-[#383733]" : "border-neutral-300"} bg-black/10`}>
                            <img src={job.originalUrl} alt={job.name} className="h-full w-full object-cover" />
                          </div>
                        </td>

                        <td className={`p-3.5 text-right font-bold ${textSecondary} align-top`}>
                          <div>{formatBytes(job.originalSize)}</div>
                          <div className={`mt-0.5 text-[10px] ${textMuted}`}>
                            {formatDimension(job.originalWidth)} × {formatDimension(job.originalHeight)}
                          </div>
                        </td>

                        <td className={`p-3.5 text-right font-bold ${textPrimary} align-top`}>
                          {job.status === "READY" && job.compressedSize !== null ? (
                            <div className={theme === "dark" ? "text-emerald-400" : "text-emerald-700"}>
                              {formatBytes(job.compressedSize)}
                              <div className={`mt-0.5 text-[10px] ${textMuted}`}>
                                {job.outputWidth && job.outputHeight ? `${job.outputWidth} × ${job.outputHeight}` : null}
                              </div>
                            </div>
                          ) : (
                            <span className={theme === "dark" ? "text-amber-300/80 italic" : "text-amber-800 italic"}>~{formatBytes(estimatedOutput)}</span>
                          )}
                        </td>

                        <td className="p-3.5 text-right font-black">
                          {job.status === "READY" && job.savingsPercent !== null ? (
                            <span className={theme === "dark" ? "text-emerald-400" : "text-emerald-700"}>-{job.savingsPercent}%</span>
                          ) : (
                            <span className={theme === "dark" ? "text-amber-400/80 italic" : "text-amber-800 italic"}>~ -{estimate}%</span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          {job.status === "PROCESSING" ? (
                            <div className="w-36 mx-auto space-y-1">
                              <div className="flex items-center justify-between text-[9px] font-bold text-amber-500">
                                <span>{job.currentStep || "Processing"}</span>
                                <span>{job.progressPercent || 10}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-neutral-800 border border-[#383733] overflow-hidden">
                                <div className="h-full bg-amber-500 transition-all duration-150" style={{ width: `${job.progressPercent || 10}%` }} />
                              </div>
                            </div>
                          ) : (
                            <span
                              className={`text-[10px] font-black px-2 py-0.5 border ${
                                job.status === "READY"
                                  ? theme === "dark"
                                    ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40"
                                    : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                  : job.status === "ERROR"
                                    ? theme === "dark"
                                      ? "bg-rose-500/20 text-rose-400 border-rose-500/40"
                                      : "bg-rose-100 text-rose-800 border-rose-300"
                                    : theme === "dark"
                                      ? "bg-amber-500/10 text-amber-400 border-amber-500/30"
                                      : "bg-neutral-100 text-neutral-800 border-neutral-300"
                              }`}
                            >
                              {job.status}
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-right">
                          <div className="flex items-center justify-end gap-1.5">
                            {job.status === "READY" ? (
                              <button
                                onClick={() => handleDownload(job)}
                                className="flex items-center gap-1 px-3 py-1 bg-emerald-500 hover:bg-emerald-400 text-black font-black text-[11px] uppercase transition cursor-pointer shadow"
                              >
                                <Download className="w-3 h-3" />
                                <span>Download</span>
                              </button>
                            ) : job.status === "QUEUED" ? (
                              <button
                                onClick={() =>
                                  compressSingleJob(job, {
                                    preset: selectedPreset,
                                    resizePercent,
                                    quality,
                                    outputFormat,
                                  })
                                }
                                className="px-2.5 py-1 bg-amber-500 hover:bg-amber-400 text-black font-bold text-[11px] uppercase transition cursor-pointer shadow"
                              >
                                Compress
                              </button>
                            ) : null}

                            <button
                              onClick={() => handleRemove(job.id)}
                              className={`p-1 border transition cursor-pointer ${
                                theme === "dark" ? "border-[#383733] hover:border-rose-500 text-neutral-500 hover:text-rose-400" : "border-neutral-300 hover:border-rose-500 text-neutral-500 hover:text-rose-600"
                              }`}
                              title="Remove Image"
                            >
                              <Trash2 className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </main>

      <footer
        className={`h-8 border-t px-4 sm:px-6 flex items-center justify-between text-[9px] sm:text-[10px] font-mono ${
          theme === "dark" ? "bg-[#181816]/95 border-[#383733] text-neutral-500" : "bg-white/95 border-[#d4d2c7] text-neutral-700"
        }`}
      >
        <span>ENGINE: <strong>IMAGE-PRESS CLIENT ENGINE</strong></span>
        <span>PRIVACY: <strong>NO SERVER UPLOADS</strong></span>
      </footer>
    </div>
  );
}

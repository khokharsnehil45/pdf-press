"use client";

import React, { useState, useRef, useEffect } from "react";
import { 
  FileText, 
  UploadCloud, 
  Download, 
  Trash2, 
  Sun, 
  Moon, 
  Sliders, 
  Boxes, 
  Layers, 
  FileCheck, 
  Sparkles, 
  ShieldCheck, 
  RefreshCw, 
  Zap,
  Gauge,
  TrendingDown,
  Lock,
  Crown,
  KeyRound
} from "lucide-react";
import { PDFDocument } from "pdf-lib";
import {
  compressPdfCore,
  formatBytes,
  formatSavingsDisplay,
  calculateAggregateStats,
  CompressionTier,
} from "@/lib/compressionEngine";
import { useProStatus } from "@/lib/useProStatus";
import { ProModal } from "@/app/components/ProModal";

interface PDFJob {
  id: string;
  name: string;
  originalSize: number; // in bytes
  compressedSize: number | null; // in bytes
  compressionRatio: number | null; // percentage saved
  status: "QUEUED" | "COMPRESSING" | "READY" | "ERROR";
  tier: CompressionTier;
  pageCount: number;
  currentPage?: number;
  progressPercent?: number;
  originalBlob: Blob;
  compressedBlob: Blob | null;
  downloadUrl: string | null;
  errorMessage?: string;
  wasOriginalKept?: boolean;
  note?: string;
}

export default function PDFCompressApp() {
  const [theme, setTheme] = useState<"dark" | "light">("dark");
  const [jobs, setJobs] = useState<PDFJob[]>([]);
  const [selectedTier, setSelectedTier] = useState<CompressionTier>("BALANCED");
  const [isDragging, setIsDragging] = useState<boolean>(false);
  const [isBatchProcessing, setIsBatchProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement | null>(null);

  // Pro status and license management hook
  const {
    isPro,
    proState,
    isVerifying,
    verifyError,
    setVerifyError,
    isModalOpen,
    setIsModalOpen,
    verifyLicenseKey,
    openCheckout,
  } = useProStatus();

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

  // Inspect and queue uploaded PDFs
  const handleFiles = async (files: FileList | null) => {
    if (!files || files.length === 0) return;

    const newJobs: PDFJob[] = [];

    for (let i = 0; i < files.length; i++) {
      const file = files[i];
      if (file.type !== "application/pdf" && !file.name.endsWith(".pdf")) {
        alert(`"${file.name}" is not a valid PDF.`);
        continue;
      }

      try {
        const arrayBuffer = await file.arrayBuffer();
        const pdfDoc = await PDFDocument.load(arrayBuffer, { ignoreEncryption: true });
        const pageCount = pdfDoc.getPageCount();

        newJobs.push({
          id: `job_${Date.now()}_${i}_${Math.random().toString(36).slice(2, 6)}`,
          name: file.name,
          originalSize: file.size,
          compressedSize: null,
          compressionRatio: null,
          status: "QUEUED",
          tier: selectedTier,
          pageCount,
          currentPage: 0,
          progressPercent: 0,
          originalBlob: file,
          compressedBlob: null,
          downloadUrl: null,
        });
      } catch (err) {
        console.error("Error inspecting PDF:", err);
      }
    }

    if (newJobs.length > 0) {
      setJobs(prev => [...prev, ...newJobs]);
    }
  };

  // Single job compression (Free & unlimited for all users)
  const compressSingleJob = async (job: PDFJob, tierToUse?: CompressionTier) => {
    const activeTier = tierToUse || job.tier || selectedTier;
    setJobs(prev => prev.map(j => j.id === job.id ? { ...j, status: "COMPRESSING", tier: activeTier, progressPercent: 5 } : j));

    try {
      const arrayBuffer = await job.originalBlob.arrayBuffer();

      const result = await compressPdfCore(
        arrayBuffer, 
        activeTier,
        (current, total, percent) => {
          setJobs(prev => prev.map(j => j.id === job.id ? { ...j, currentPage: current, progressPercent: percent } : j));
        }
      );

      const blob = new Blob([result.bytes.buffer as ArrayBuffer], { type: "application/pdf" });
      const downloadUrl = URL.createObjectURL(blob);

      setJobs(prev => prev.map(j => {
        if (j.id === job.id) {
          return {
            ...j,
            status: "READY",
            tier: activeTier,
            compressedSize: result.compressedSize,
            compressionRatio: result.compressionRatio,
            compressedBlob: blob,
            downloadUrl,
            progressPercent: 100,
            wasOriginalKept: result.wasOriginalKept,
            note: result.note,
          };
        }
        return j;
      }));
    } catch (error) {
      console.error("Compression error:", error);
      setJobs(prev => prev.map(j => {
        if (j.id === job.id) {
          return {
            ...j,
            status: "ERROR",
            errorMessage: "PDF structure is protected or corrupted.",
          };
        }
        return j;
      }));
    }
  };

  // Batch compression (Gated behind Pro for >1 file)
  const handleCompressAll = async () => {
    const queued = jobs.filter(j => j.status === "QUEUED");
    if (queued.length === 0) return;

    // Feature Gate: Batch processing multiple queued documents requires Pro
    if (!isPro && queued.length > 1) {
      setIsModalOpen(true);
      return;
    }

    setIsBatchProcessing(true);
    for (const job of queued) {
      await compressSingleJob(job, selectedTier);
    }
    setIsBatchProcessing(false);
  };

  const handleDownload = (job: PDFJob) => {
    if (!job.downloadUrl) return;
    const a = document.createElement("a");
    a.href = job.downloadUrl;
    a.download = `COMPRESSED_${job.name}`;
    a.click();
  };

  const handleRemove = (jobId: string) => {
    setJobs(prev => prev.filter(j => j.id !== jobId));
  };

  const handleClearAll = () => {
    setJobs([]);
  };

  // Dynamic Estimates
  const getTierRatio = (tier: CompressionTier) => {
    switch (tier) {
      case "AGGRESSIVE": return 70;
      case "BALANCED": return 50;
      case "LOSSLESS": return 25;
    }
  };

  const calculateEstimate = (originalSize: number, tier: CompressionTier) => {
    const ratio = getTierRatio(tier);
    const estimatedSaved = Math.round(originalSize * (ratio / 100));
    const estimatedFinal = Math.max(0, originalSize - estimatedSaved);
    return { ratio, estimatedSaved, estimatedFinal };
  };

  const handleSelectTier = (tier: CompressionTier) => {
    setSelectedTier(tier);
    setJobs(prev => prev.map(j => (j.status === "QUEUED" ? { ...j, tier } : j)));
  };

  const totalOriginalBytes = jobs.reduce((acc, j) => acc + j.originalSize, 0);
  const readyJobs = jobs.filter(j => j.status === "READY");
  const queuedJobs = jobs.filter(j => j.status === "QUEUED");
  const hasCompressedJobs = readyJobs.length > 0;
  const aggregateStats = calculateAggregateStats(readyJobs);
  const overallEstimated = calculateEstimate(totalOriginalBytes, selectedTier);

  const textPrimary = theme === "dark" ? "text-neutral-100" : "text-neutral-900";
  const textSecondary = theme === "dark" ? "text-neutral-400" : "text-neutral-700";
  const textMuted = theme === "dark" ? "text-neutral-500" : "text-neutral-600";

  return (
    <div className={`min-h-screen flex flex-col font-mono select-none transition-colors duration-200 ${
      theme === "dark" ? "bg-grid-pattern-dark text-[#ecebe6]" : "bg-grid-pattern-light text-[#111827]"
    }`}>
      
      {/* Top Header */}
      <header className={`h-14 border-b px-3 sm:px-6 flex items-center justify-between z-30 ${
        theme === "dark" ? "bg-[#181816]/95 border-[#383733]" : "bg-white/95 border-[#d4d2c7]"
      }`}>
        <div className="flex items-center gap-2.5">
          <div className="w-7 h-7 bg-amber-500 text-black flex items-center justify-center font-black text-xs shadow">
            <FileText className="w-4 h-4" />
          </div>
          <div>
            <div className="flex items-center gap-1.5">
              <span className={`font-black text-xs sm:text-sm tracking-wider uppercase ${textPrimary}`}>PDF-PRESS</span>
              <span className={`text-[8px] sm:text-[9px] font-bold px-1.5 py-0.5 border ${
                theme === "dark" ? "bg-[#262624] text-amber-400 border-amber-500/30" : "bg-amber-100 text-amber-800 border-amber-300"
              }`}>
                CLIENT OFFLINE
              </span>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-2">
          {/* Pro Status / Upgrade Buttons */}
          {isPro ? (
            <button
              onClick={() => setIsModalOpen(true)}
              className="flex items-center gap-1.5 px-2.5 py-1 border border-amber-500/40 bg-amber-500/10 hover:bg-amber-500/20 text-amber-400 font-bold text-[11px] uppercase transition cursor-pointer shadow-xs"
              title="Pro License Active"
            >
              <Crown className="w-3.5 h-3.5 text-amber-400" />
              <span className="hidden sm:inline">PRO ACTIVE</span>
              <span className="sm:hidden">PRO</span>
            </button>
          ) : (
            <>
              <button
                onClick={() => {
                  setVerifyError(null);
                  setIsModalOpen(true);
                }}
                className={`hidden md:flex items-center gap-1 px-2.5 py-1 border text-[11px] font-bold uppercase transition cursor-pointer ${
                  theme === "dark" 
                    ? "border-[#383733] hover:border-neutral-500 text-neutral-400 hover:text-neutral-200" 
                    : "border-neutral-300 hover:border-neutral-800 text-neutral-700 hover:text-neutral-900"
                }`}
                title="Enter license key to restore purchase"
              >
                <KeyRound className="w-3 h-3" />
                <span>Enter Key</span>
              </button>

              <button
                onClick={() => setIsModalOpen(true)}
                className="flex items-center gap-1.5 px-2.5 sm:px-3 py-1 bg-amber-500 hover:bg-amber-400 text-black font-black text-[11px] uppercase tracking-wider transition cursor-pointer shadow shadow-amber-500/10"
              >
                <Crown className="w-3.5 h-3.5" />
                <span>Upgrade to Pro</span>
              </button>
            </>
          )}

          {/* Theme Switcher */}
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

      {/* Main Workspace Body */}
      <main className="flex-1 p-3 sm:p-6 space-y-4 sm:space-y-6 max-w-5xl mx-auto w-full">
        
        {/* Metric Cards Row */}
        <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 sm:gap-3">
          
          <div className={`p-3 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"}`}>
            <div className={`text-[9px] sm:text-[10px] uppercase font-bold flex items-center justify-between ${textSecondary}`}>
              <span>DOCUMENTS</span>
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
            <div className={`text-lg sm:text-2xl font-black font-mono mt-1 ${textPrimary}`}>
              {formatBytes(totalOriginalBytes)}
            </div>
          </div>

          <div className={`p-3 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"}`}>
            <div className={`text-[9px] sm:text-[10px] uppercase font-bold flex items-center justify-between ${textSecondary}`}>
              <span>{hasCompressedJobs ? "ACTUAL SAVINGS" : "EST. SAVINGS"}</span>
              <Sparkles className="w-3.5 h-3.5 text-emerald-500" />
            </div>
            <div className="text-lg sm:text-2xl font-black text-emerald-600 dark:text-emerald-400 font-mono mt-1">
              {hasCompressedJobs ? aggregateStats.savingsDisplay : formatBytes(overallEstimated.estimatedSaved)}
            </div>
          </div>

          <div className={`p-3 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"}`}>
            <div className={`text-[9px] sm:text-[10px] uppercase font-bold flex items-center justify-between ${textSecondary}`}>
              <span>{hasCompressedJobs ? "AVG RATIO" : "EST. RATIO"}</span>
              <Gauge className="w-3.5 h-3.5 text-amber-500" />
            </div>
            <div className="text-2xl font-black text-amber-600 dark:text-amber-400 font-mono mt-1">
              {hasCompressedJobs ? aggregateStats.ratioDisplay : `~${overallEstimated.ratio}%`}
            </div>
          </div>

        </div>

        {/* Compression Tier Selector with Dynamic Preview */}
        <div className={`p-3.5 sm:p-4 border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"} space-y-3`}>
          <div className="flex items-center justify-between flex-wrap gap-1.5">
            <span className={`text-xs font-black uppercase flex items-center gap-1.5 ${textPrimary}`}>
              <Sliders className="w-3.5 h-3.5 text-amber-500" />
              COMPRESSION PRESET
            </span>
            {totalOriginalBytes > 0 && (
              <span className={`text-[10px] sm:text-[11px] font-mono font-bold px-2 py-0.5 border ${
                theme === "dark" ? "text-amber-400 bg-amber-500/10 border-amber-500/30" : "text-amber-800 bg-amber-100 border-amber-300"
              }`}>
                Est. Output: {formatBytes(overallEstimated.estimatedFinal)} (Save ~{formatBytes(overallEstimated.estimatedSaved)})
              </span>
            )}
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2 sm:gap-3">
            {[
              { 
                id: "BALANCED" as const, 
                name: "BALANCED (RECOMMENDED)", 
                badge: "STANDARD",
                desc: "Canvas raster downsampling (58% Q, 1.3x DPI) with structural compaction fallback.",
                ratioText: "~45% - 60% size drop",
              },
              { 
                id: "AGGRESSIVE" as const, 
                name: "MAX COMPRESSION", 
                badge: "MAX SAVINGS",
                desc: "Deep downsampling (38% Q, 1.0x DPI) + metadata strip with auto size guard.",
                ratioText: "~65% - 80% size drop",
              },
              { 
                id: "LOSSLESS" as const, 
                name: "HIGH QUALITY", 
                badge: "HIGH RES",
                desc: "High clarity raster (82% Q, 1.6x DPI) + stream compaction with auto size guard.",
                ratioText: "~20% - 35% size drop",
              },
            ].map(tier => {
              const est = calculateEstimate(totalOriginalBytes, tier.id);
              const isSelected = selectedTier === tier.id;

              return (
                <button
                  key={tier.id}
                  onClick={() => handleSelectTier(tier.id)}
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
                      <span className={`text-xs font-black uppercase tracking-wide ${textPrimary}`}>{tier.name}</span>
                      {isSelected ? (
                        <span className="text-[9px] font-black px-1.5 py-0.5 bg-amber-500 text-black uppercase">
                          ACTIVE
                        </span>
                      ) : (
                        <span className={`text-[9px] font-bold px-1.5 py-0.5 uppercase border ${
                          theme === "dark" ? "bg-neutral-800 text-neutral-400 border-neutral-700" : "bg-neutral-200 text-neutral-800 border-neutral-300"
                        }`}>
                          {tier.badge}
                        </span>
                      )}
                    </div>
                    <p className={`text-[10px] sm:text-[11px] leading-snug font-medium ${textSecondary}`}>{tier.desc}</p>
                  </div>

                  <div className={`p-1.5 sm:p-2 border text-[10px] sm:text-[11px] font-mono flex items-center justify-between ${
                    isSelected 
                      ? theme === "dark" ? "border-amber-500/40 bg-amber-500/15 text-amber-200" : "border-amber-400 bg-amber-100 text-amber-900 font-bold"
                      : theme === "dark" ? "border-[#262624] bg-[#181816]/70 text-neutral-400" : "border-neutral-200 bg-white text-neutral-700"
                  }`}>
                    <div className="flex items-center gap-1">
                      <TrendingDown className={`w-3.5 h-3.5 ${isSelected ? (theme === "dark" ? "text-amber-400" : "text-amber-700") : textMuted}`} />
                      <span className="font-bold">{tier.ratioText}</span>
                    </div>

                    {totalOriginalBytes > 0 && (
                      <div className="text-right">
                        <span className={`text-[9px] block ${textMuted}`}>Will Save</span>
                        <span className={`font-black ${isSelected ? (theme === "dark" ? "text-emerald-400" : "text-emerald-700") : textPrimary}`}>
                          ~{formatBytes(est.estimatedSaved)}
                        </span>
                      </div>
                    )}
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Drop Zone */}
        <div
          onDragOver={(e) => {
            e.preventDefault();
            setIsDragging(true);
          }}
          onDragLeave={() => setIsDragging(false)}
          onDrop={(e) => {
            e.preventDefault();
            setIsDragging(false);
            handleFiles(e.dataTransfer.files);
          }}
          onClick={() => fileInputRef.current?.click()}
          className={`border-2 border-dashed p-6 sm:p-8 flex flex-col items-center justify-center gap-2.5 sm:gap-3 transition-all cursor-pointer ${
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
            accept="application/pdf,.pdf"
            className="hidden"
            onChange={(e) => handleFiles(e.target.files)}
          />

          <div className={`w-10 h-10 border flex items-center justify-center shadow ${
            theme === "dark" ? "bg-[#262624] border-[#383733] text-amber-400" : "bg-amber-100 border-amber-300 text-amber-700"
          }`}>
            <UploadCloud className="w-5 h-5" />
          </div>

          <div className="text-center space-y-1">
            <div className={`text-xs sm:text-sm font-black uppercase tracking-wider ${textPrimary}`}>
              TAP OR DROP PDF DOCUMENTS HERE
            </div>
            <p className={`text-[10px] sm:text-[11px] font-mono font-medium ${textSecondary}`}>
              Smart downsampling & stream compression • Automatic fallback protection • 100% in browser
            </p>
          </div>

          <div className={`flex items-center gap-1.5 pt-1 text-[9px] sm:text-[10px] font-mono font-bold ${
            theme === "dark" ? "text-emerald-400" : "text-emerald-700"
          }`}>
            <ShieldCheck className="w-3.5 h-3.5" />
            <span>NO SERVER UPLOADS • 100% OFFLINE SAFE</span>
          </div>
        </div>

        {/* Document Ingest Stack */}
        {jobs.length > 0 && (
          <div className="space-y-3">
            
            <div className="flex items-center justify-between flex-wrap gap-2">
              <span className={`text-xs font-black uppercase tracking-wider flex items-center gap-1.5 ${textPrimary}`}>
                <FileCheck className="w-4 h-4 text-emerald-500" />
                QUEUED ({jobs.length})
              </span>

              <div className="flex items-center gap-2">
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

                {/* Batch Compress Button (Gated with Pro Indicator when >1 file) */}
                <button
                  onClick={handleCompressAll}
                  disabled={isBatchProcessing || jobs.every(j => j.status === "READY")}
                  title={
                    !isPro && queuedJobs.length > 1
                      ? "Upgrade to Pro to compress multiple files at once"
                      : "Compress queued documents"
                  }
                  className={`flex items-center gap-1.5 px-3 py-1 sm:px-4 sm:py-1.5 font-black text-xs uppercase tracking-wider transition cursor-pointer shadow ${
                    isBatchProcessing || jobs.every(j => j.status === "READY")
                      ? "bg-neutral-800 text-neutral-500 border border-neutral-700 cursor-not-allowed"
                      : !isPro && queuedJobs.length > 1
                        ? "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20"
                        : "bg-amber-500 hover:bg-amber-400 text-black shadow-amber-500/20"
                  }`}
                >
                  {isBatchProcessing ? (
                    <RefreshCw className="w-3.5 h-3.5 animate-spin" />
                  ) : !isPro && queuedJobs.length > 1 ? (
                    <Lock className="w-3.5 h-3.5 text-amber-950" />
                  ) : (
                    <Zap className="w-3.5 h-3.5" />
                  )}
                  <span>
                    {isBatchProcessing 
                      ? "Compressing..." 
                      : `Compress All (${selectedTier})`}
                  </span>
                  {!isPro && queuedJobs.length > 1 && (
                    <span className="text-[9px] font-black px-1 py-0.2 bg-black text-amber-400 border border-amber-400/40 uppercase">
                      PRO
                    </span>
                  )}
                </button>
              </div>
            </div>

            {/* Mobile Stack Cards */}
            <div className="block sm:hidden space-y-2.5">
              {jobs.map((job) => {
                const jobEst = calculateEstimate(job.originalSize, selectedTier);
                const savingsInfo = formatSavingsDisplay(job.originalSize, job.compressedSize, job.wasOriginalKept);

                return (
                  <div 
                    key={job.id} 
                    className={`p-3 border ${
                      theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"
                    } space-y-2`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="flex items-center gap-2 truncate">
                        <FileText className="w-4 h-4 text-amber-500 shrink-0" />
                        <span className={`text-xs font-bold truncate ${textPrimary}`} title={job.name}>{job.name}</span>
                      </div>
                      <button
                        onClick={() => handleRemove(job.id)}
                        className="text-neutral-500 hover:text-rose-500 p-1 cursor-pointer"
                        title="Remove Document"
                      >
                        <Trash2 className="w-3.5 h-3.5" />
                      </button>
                    </div>

                    {/* Live Progress Bar */}
                    {job.status === "COMPRESSING" && (
                      <div className="space-y-1">
                        <div className="flex items-center justify-between text-[10px] font-mono text-amber-500 font-bold">
                          <span>Processing Page {job.currentPage || 1} of {job.pageCount}</span>
                          <span>{job.progressPercent || 10}%</span>
                        </div>
                        <div className="w-full h-1.5 bg-neutral-800 border border-[#383733] overflow-hidden">
                          <div 
                            className="h-full bg-amber-500 transition-all duration-200" 
                            style={{ width: `${job.progressPercent || 10}%` }}
                          />
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
                        <span className={`font-bold ${job.status === "READY" ? (job.wasOriginalKept ? textSecondary : theme === "dark" ? "text-emerald-400" : "text-emerald-700") : textPrimary}`}>
                          {job.status === "READY" && job.compressedSize !== null ? formatBytes(job.compressedSize) : `~${formatBytes(jobEst.estimatedFinal)}`}
                        </span>
                      </div>
                      <div className="text-right">
                        <span className={`block ${textMuted}`}>Savings</span>
                        <span className={`font-black ${
                          job.status === "READY" 
                            ? savingsInfo.isPositive
                              ? theme === "dark" ? "text-emerald-400" : "text-emerald-600"
                              : savingsInfo.isNegative
                                ? "text-rose-500"
                                : textMuted
                            : textMuted
                        }`}>
                          {job.status === "READY" ? savingsInfo.text : `~ -${jobEst.ratio}%`}
                        </span>
                      </div>
                    </div>

                    {job.status === "READY" && job.note && (
                      <p className={`text-[9px] font-mono ${job.wasOriginalKept ? (theme === "dark" ? "text-amber-400/90" : "text-amber-700") : textMuted}`}>
                        {job.note}
                      </p>
                    )}

                    <div className="flex items-center justify-between pt-1">
                      <span className={`text-[9px] font-black px-1.5 py-0.5 border ${
                        job.status === "READY" 
                          ? job.wasOriginalKept
                            ? theme === "dark" ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "bg-amber-100 text-amber-800 border-amber-300"
                            : theme === "dark" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-emerald-100 text-emerald-800 border-emerald-300"
                          : job.status === "COMPRESSING" 
                            ? theme === "dark" ? "bg-amber-500/20 text-amber-400 border-amber-500/40 animate-pulse" : "bg-amber-100 text-amber-800 border-amber-300 animate-pulse"
                            : theme === "dark" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-neutral-100 text-neutral-800 border-neutral-300"
                      }`}>
                        {job.status === "READY" ? (job.wasOriginalKept ? "ORIGINAL KEPT" : "OPTIMIZED") : job.status}
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
                          onClick={() => compressSingleJob(job, selectedTier)}
                          disabled={job.status === "COMPRESSING"}
                          className={`px-2.5 py-1 font-bold text-[11px] uppercase transition cursor-pointer shadow ${
                            job.status === "COMPRESSING" ? "bg-neutral-700 text-neutral-400 cursor-not-allowed" : "bg-amber-500 hover:bg-amber-400 text-black"
                          }`}
                        >
                          {job.status === "COMPRESSING" ? "Working..." : "Compress"}
                        </button>
                      )}
                    </div>
                  </div>
                );
              })}
            </div>

            {/* Desktop / Tablet Table */}
            <div className={`hidden sm:block border ${theme === "dark" ? "border-[#383733] bg-[#181816]" : "border-[#d4d2c7] bg-white shadow-xs"} overflow-x-auto`}>
              <table className="w-full text-left border-collapse font-mono text-xs">
                <thead>
                  <tr className={`border-b uppercase text-[10px] font-bold ${
                    theme === "dark" ? "border-[#383733] bg-[#141412] text-neutral-400" : "border-[#d4d2c7] bg-[#eeece2] text-neutral-800"
                  }`}>
                    <th className="p-3.5">Document Name</th>
                    <th className="p-3.5 text-right">Original</th>
                    <th className="p-3.5 text-right">Optimized</th>
                    <th className="p-3.5 text-right">Savings</th>
                    <th className="p-3.5 text-center">Status / Progress</th>
                    <th className="p-3.5 text-right">Action</th>
                  </tr>
                </thead>
                <tbody className={theme === "dark" ? "divide-y divide-[#262624]" : "divide-y divide-neutral-200"}>
                  {jobs.map((job) => {
                    const jobEst = calculateEstimate(job.originalSize, selectedTier);
                    const savingsInfo = formatSavingsDisplay(job.originalSize, job.compressedSize, job.wasOriginalKept);

                    return (
                      <tr key={job.id} className={`transition-colors ${
                        theme === "dark" ? "hover:bg-[#1f1e1c]/70" : "hover:bg-neutral-50"
                      }`}>
                        <td className="p-3.5">
                          <div className={`font-bold flex items-center gap-2 ${textPrimary}`}>
                            <FileText className="w-3.5 h-3.5 text-amber-500 shrink-0" />
                            <span className="truncate max-w-xs">{job.name}</span>
                          </div>
                          <div className={`text-[10px] mt-0.5 font-mono flex items-center gap-2 ${textMuted}`}>
                            <span>{job.pageCount} Pages</span>
                            <span>•</span>
                            <span className={theme === "dark" ? "text-amber-400/80 font-bold" : "text-amber-800 font-bold"}>
                              {job.status === "READY" ? job.tier : `${selectedTier} (PREVIEW)`}
                            </span>
                            {job.status === "READY" && job.note && (
                              <>
                                <span>•</span>
                                <span className={job.wasOriginalKept ? (theme === "dark" ? "text-amber-400 font-medium" : "text-amber-700 font-medium") : textMuted}>
                                  {job.note}
                                </span>
                              </>
                            )}
                          </div>
                        </td>

                        <td className={`p-3.5 text-right font-bold ${textSecondary}`}>
                          {formatBytes(job.originalSize)}
                        </td>

                        <td className={`p-3.5 text-right font-bold ${textPrimary}`}>
                          {job.status === "READY" && job.compressedSize !== null ? (
                            <span className={job.wasOriginalKept ? textSecondary : theme === "dark" ? "text-emerald-400" : "text-emerald-700"}>
                              {formatBytes(job.compressedSize)}
                            </span>
                          ) : (
                            <span className={theme === "dark" ? "text-amber-300/80 italic" : "text-amber-800 italic"}>
                              ~{formatBytes(jobEst.estimatedFinal)}
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-right font-black">
                          {job.status === "READY" ? (
                            <span className={
                              savingsInfo.isPositive
                                ? theme === "dark" ? "text-emerald-400" : "text-emerald-700"
                                : savingsInfo.isNegative
                                  ? "text-rose-500 font-bold"
                                  : textMuted
                            }>
                              {savingsInfo.text}
                            </span>
                          ) : (
                            <span className={theme === "dark" ? "text-amber-400/80 italic" : "text-amber-800 italic"}>
                              ~ -{jobEst.ratio}%
                            </span>
                          )}
                        </td>

                        <td className="p-3.5 text-center">
                          {job.status === "COMPRESSING" ? (
                            <div className="w-36 mx-auto space-y-1">
                              <div className="flex items-center justify-between text-[9px] font-bold text-amber-500">
                                <span>P.{job.currentPage || 1}/{job.pageCount}</span>
                                <span>{job.progressPercent || 10}%</span>
                              </div>
                              <div className="w-full h-1.5 bg-neutral-800 border border-[#383733] overflow-hidden">
                                <div 
                                  className="h-full bg-amber-500 transition-all duration-150" 
                                  style={{ width: `${job.progressPercent || 10}%` }}
                                />
                              </div>
                            </div>
                          ) : (
                            <span className={`text-[10px] font-black px-2 py-0.5 border ${
                              job.status === "READY" 
                                ? job.wasOriginalKept
                                  ? theme === "dark" ? "bg-amber-500/20 text-amber-400 border-amber-500/40" : "bg-amber-100 text-amber-800 border-amber-300"
                                  : theme === "dark" ? "bg-emerald-500/20 text-emerald-400 border-emerald-500/40" : "bg-emerald-100 text-emerald-800 border-emerald-300"
                                : job.status === "ERROR" 
                                  ? theme === "dark" ? "bg-rose-500/20 text-rose-400 border-rose-500/40" : "bg-rose-100 text-rose-800 border-rose-300"
                                  : theme === "dark" ? "bg-amber-500/10 text-amber-400 border-amber-500/30" : "bg-neutral-100 text-neutral-800 border-neutral-300"
                            }`}>
                              {job.status === "READY" ? (job.wasOriginalKept ? "ORIGINAL KEPT" : "OPTIMIZED") : job.status === "QUEUED" ? "READY" : job.status}
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
                                onClick={() => compressSingleJob(job, selectedTier)}
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
                              title="Remove Document"
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

      {/* Footer */}
      <footer className={`h-8 border-t px-4 sm:px-6 flex items-center justify-between text-[9px] sm:text-[10px] font-mono ${
        theme === "dark" ? "bg-[#181816]/95 border-[#383733] text-neutral-500" : "bg-white/95 border-[#d4d2c7] text-neutral-700"
      }`}>
        <span>ENGINE: <strong>PDF-PRESS CLIENT ENGINE</strong></span>
        <span>PRIVACY: <strong>100% DISK ISOLATED</strong></span>
      </footer>

      {/* Pro Paywall / License Activation Modal */}
      <ProModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        isPro={isPro}
        proState={proState}
        onOpenCheckout={openCheckout}
        onVerifyKey={verifyLicenseKey}
        isVerifying={isVerifying}
        verifyError={verifyError}
        onClearError={() => setVerifyError(null)}
        theme={theme}
      />

    </div>
  );
}

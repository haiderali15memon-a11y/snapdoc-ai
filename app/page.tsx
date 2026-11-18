"use client";

import React, { useState, useRef, useEffect } from "react";
import {
  Search,
  Plus,
  Camera,
  Image as ImageIcon,
  FileText,
  Download,
  Share2,
  Sparkles,
  RotateCw,
  Trash2,
  Check,
  X,
  CreditCard,
  ScanText,
  Layers,
} from "lucide-react";
import { jsPDF } from "jspdf";
import { PDFDocument } from "pdf-lib";
import { createWorker } from "tesseract.js";

interface ScannedDoc {
  id: string;
  title: string;
  category: "All Docs" | "ID Cards" | "Invoices" | "Notes";
  date: string;
  size: string;
  pages: string[]; // Base64 image strings
  filter: string;
}

export default function SnapDocAI() {
  // Navigation & UI States
  const [activeTab, setActiveTab] = useState<"home" | "scan" | "edit">("home");
  const [selectedCategory, setSelectedCategory] = useState<string>("All Docs");
  const [searchQuery, setSearchQuery] = useState<string>("");
  const [documents, setDocuments] = useState<ScannedDoc[]>([]);

  // Scanner & Editor States
  const [capturedPages, setCapturedPages] = useState<string[]>([]);
  const [currentFilter, setCurrentFilter] = useState<string>("magic");
  const [docTitle, setDocTitle] = useState<string>("");
  const [docCategory, setDocCategory] = useState<"ID Cards" | "Invoices" | "Notes">("Notes");
  const [isProcessing, setIsProcessing] = useState<boolean>(false);

  const fileInputRef = useRef<HTMLInputElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const [cameraActive, setCameraActive] = useState<boolean>(false);
  const [ocrText, setOcrText] = useState<string>("");
  const [pdfFormat, setPdfFormat] = useState<"a4" | "letter">("a4");
  const [selectedPageIndex, setSelectedPageIndex] = useState(0);
  const [cropMargins, setCropMargins] = useState({ top: 0, right: 0, bottom: 0, left: 0 });
  const [straightenAngle, setStraightenAngle] = useState(0);
  const [ocrBusy, setOcrBusy] = useState<boolean>(false);
  const [mergeBusy, setMergeBusy] = useState<boolean>(false);
  const pdfInputRef = useRef<HTMLInputElement>(null);

  // Load saved documents from browser localStorage (No-Login persistence)
  useEffect(() => {
    const saved = localStorage.getItem("snapdoc_files");
    if (saved) {
      setDocuments(JSON.parse(saved));
    }
  }, []);

  // Save documents locally
  const saveToLocal = (updatedDocs: ScannedDoc[]) => {
    setDocuments(updatedDocs);
    localStorage.setItem("snapdoc_files", JSON.stringify(updatedDocs));
  };

  // Release camera hardware on unmount.
  useEffect(() => {
    return () => {
      const stream = videoRef.current?.srcObject as MediaStream | null;
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, []);

  // Reorder captured pages without leaving the device.
  const movePage = (index: number, direction: -1 | 1) => {
    setCapturedPages((pages) => {
      const target = index + direction;
      if (target < 0 || target >= pages.length) return pages;
      const next = [...pages];
      [next[index], next[target]] = [next[target], next[index]];
      return next;
    });
  };

  const rotatePageBy = (index: number, degrees: number) => {
    const source = capturedPages[index];
    if (!source) return;
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const radians = (degrees * Math.PI) / 180;
      const sin = Math.abs(Math.sin(radians));
      const cos = Math.abs(Math.cos(radians));
      canvas.width = Math.ceil(img.width * cos + img.height * sin);
      canvas.height = Math.ceil(img.height * cos + img.width * sin);
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.translate(canvas.width / 2, canvas.height / 2);
      ctx.rotate(radians);
      ctx.drawImage(img, -img.width / 2, -img.height / 2);
      const rotated = canvas.toDataURL("image/jpeg", 0.92);
      setCapturedPages((pages) => pages.map((page, i) => (i === index ? rotated : page)));
    };
    img.src = source;
  };

  const rotatePage = (index: number) => rotatePageBy(index, 90);

  const cropPage = (index: number) => {
    const source = capturedPages[index];
    if (!source) return;
    const { top, right, bottom, left } = cropMargins;
    if (top + bottom >= 80 || left + right >= 80) {
      alert("Crop margins must leave at least 20% of the page.");
      return;
    }
    const img = new Image();
    img.onload = () => {
      const canvas = document.createElement("canvas");
      const x = Math.round((img.width * left) / 100);
      const y = Math.round((img.height * top) / 100);
      canvas.width = Math.max(1, Math.round((img.width * (100 - left - right)) / 100));
      canvas.height = Math.max(1, Math.round((img.height * (100 - top - bottom)) / 100));
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      ctx.drawImage(img, x, y, canvas.width, canvas.height, 0, 0, canvas.width, canvas.height);
      const cropped = canvas.toDataURL("image/jpeg", 0.92);
      setCapturedPages((pages) => pages.map((page, i) => (i === index ? cropped : page)));
      setCropMargins({ top: 0, right: 0, bottom: 0, left: 0 });
      setStraightenAngle(0);
    };
    img.src = source;
  };

  const applyStraighten = () => {
    if (Math.abs(straightenAngle) < 0.1) return;
    rotatePageBy(selectedPageIndex, straightenAngle);
    setStraightenAngle(0);
  };

  // Start Live Camera
  const startCamera = async () => {
    setActiveTab("scan");
    setCameraActive(true);
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: { facingMode: "environment" },
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
    } catch (err) {
      alert("Camera access nahi mila. Aap Gallery se image import kar sakte hain.");
      setCameraActive(false);
    }
  };

  // Stop Live Camera
  const stopCamera = () => {
    if (videoRef.current && videoRef.current.srcObject) {
      const stream = videoRef.current.srcObject as MediaStream;
      stream.getTracks().forEach((track) => track.stop());
    }
    setCameraActive(false);
  };

  // Capture Photo from Camera
  const capturePhoto = () => {
    if (!videoRef.current) return;
    const canvas = document.createElement("canvas");
    canvas.width = videoRef.current.videoWidth;
    canvas.height = videoRef.current.videoHeight;
    const ctx = canvas.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoRef.current, 0, 0);
      const imageData = canvas.toDataURL("image/jpeg", 0.9);
      setCapturedPages((prev) => [...prev, imageData]);
    }
  };

  // Import Images from Gallery
  const handleGalleryUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const files = e.target.files;
    if (!files) return;

    Array.from(files).forEach((file) => {
      const reader = new FileReader();
      reader.onload = (event) => {
        if (event.target?.result) {
          setCapturedPages((prev) => [...prev, event.target!.result as string]);
          setActiveTab("edit");
        }
      };
      reader.readAsDataURL(file);
    });
  };

  // Multilingual OCR runs locally across every page; no image or OCR text is uploaded.
  const runOCR = async () => {
    if (capturedPages.length === 0) {
      fileInputRef.current?.click();
      return;
    }
    setOcrBusy(true);
    setOcrText("");
    let worker: Awaited<ReturnType<typeof createWorker>> | undefined;
    try {
      worker = await createWorker("eng+urd");
      const results: string[] = [];
      for (let index = 0; index < capturedPages.length; index++) {
        const result = await worker.recognize(capturedPages[index]);
        const text = result.data.text.trim();
        results.push(`--- Page ${index + 1} ---\\n${text || "No readable text found."}`);
      }
      setOcrText(results.join("\\n\\n"));
    } catch (error) {
      console.error("On-device multilingual OCR failed:", error);
      setOcrText("OCR could not process this document. Check your internet connection for language data, then try a clearer image.");
    } finally {
      await worker?.terminate().catch(() => undefined);
      setOcrBusy(false);
    }
  };

  const mergePDFs = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files || []).filter((file) => file.type === "application/pdf");
    if (files.length < 2) {
      alert("Please select at least two PDF files to merge.");
      event.target.value = "";
      return;
    }
    setMergeBusy(true);
    try {
      const merged = await PDFDocument.create();
      for (const file of files) {
        const source = await PDFDocument.load(await file.arrayBuffer());
        const pages = await merged.copyPages(source, source.getPageIndices());
        pages.forEach((page) => merged.addPage(page));
      }
      const bytes = await merged.save();
      const blob = new Blob([bytes], { type: "application/pdf" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = "SnapDoc-Merged.pdf";
      link.click();
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error("PDF merge failed:", error);
      alert("Could not merge these PDFs. One may be password-protected or damaged.");
    } finally {
      setMergeBusy(false);
      event.target.value = "";
    }
  };

  // CSS Filter Classes for AI Enhancement Preview
  const getFilterStyle = (filter: string) => {
    switch (filter) {
      case "magic":
        return "contrast(1.35) brightness(1.08) saturate(1.15)";
      case "bw":
        return "grayscale(1) contrast(1.8) brightness(1.1)";
      case "grayscale":
        return "grayscale(1) contrast(1.1)";
      case "clean":
        return "grayscale(1) contrast(1.55) brightness(1.08)";
      default:
        return "none";
    }
  };

  // Apply Filter on Canvas & Generate PDF + Trigger SQL/Zapier API
  const handleSaveAndGeneratePDF = async () => {
    if (capturedPages.length === 0) return;
    setIsProcessing(true);

    const finalTitle = docTitle.trim() || `Scan_${new Date().toLocaleDateString().replace(/\//g, "-")}`;
    const pdf = new jsPDF({ orientation: "portrait", unit: "mm", format: pdfFormat });

    for (let i = 0; i < capturedPages.length; i++) {
      if (i > 0) pdf.addPage(pdfFormat);

      // Process image with selected AI filter
      const img = new Image();
      img.src = capturedPages[i];
      await new Promise((resolve) => (img.onload = resolve));

      const canvas = document.createElement("canvas");
      canvas.width = img.width;
      canvas.height = img.height;
      const ctx = canvas.getContext("2d")!;
      ctx.filter = currentFilter === "clean" ? "none" : getFilterStyle(currentFilter);
      ctx.drawImage(img, 0, 0);
      if (currentFilter === "clean") {
        const frame = ctx.getImageData(0, 0, canvas.width, canvas.height);
        const data = frame.data;
        const tileSize = 24;
        for (let ty = 0; ty < canvas.height; ty += tileSize) {
          for (let tx = 0; tx < canvas.width; tx += tileSize) {
            const xEnd = Math.min(canvas.width, tx + tileSize);
            const yEnd = Math.min(canvas.height, ty + tileSize);
            let sum = 0;
            let count = 0;
            for (let py = ty; py < yEnd; py += 1) {
              for (let px = tx; px < xEnd; px += 1) {
                const offset = (py * canvas.width + px) * 4;
                sum += 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
                count += 1;
              }
            }
            const threshold = Math.max(145, sum / Math.max(1, count) - 22);
            for (let py = ty; py < yEnd; py += 1) {
              for (let px = tx; px < xEnd; px += 1) {
                const offset = (py * canvas.width + px) * 4;
                const luminance = 0.299 * data[offset] + 0.587 * data[offset + 1] + 0.114 * data[offset + 2];
                const value = luminance < threshold ? 0 : 255;
                data[offset] = value;
                data[offset + 1] = value;
                data[offset + 2] = value;
              }
            }
          }
        }
        ctx.putImageData(frame, 0, 0);
      }

      const processedData = canvas.toDataURL("image/jpeg", 0.85);
      const pdfWidth = pdf.internal.pageSize.getWidth();
      const pdfHeight = (img.height * pdfWidth) / img.width;

      pdf.addImage(processedData, "JPEG", 0, 0, pdfWidth, pdfHeight);
      // Subtle Free Branding Footer
      pdf.setFontSize(8);
      pdf.setTextColor(150);
      pdf.text("Scanned free with SnapDoc AI", 10, pdf.internal.pageSize.getHeight() - 4);
    }

    // Download PDF directly to user's device
    pdf.save(`${finalTitle}.pdf`);

    // Save metadata to Local History
    const newDoc: ScannedDoc = {
      id: Date.now().toString(),
      title: `${finalTitle}.pdf`,
      category: docCategory,
      date: new Date().toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" }),
      size: `${(capturedPages.length * 0.4).toFixed(1)} MB`,
      pages: capturedPages,
      filter: currentFilter,
    };
    saveToLocal([newDoc, ...documents]);

    // Trigger Backend API (SQL Database + Zapier Webhook)
    try {
      const logResponse = await fetch("/api/v1/supersnap/process", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          pageCount: capturedPages.length,
          filterUsed: currentFilter,
          category: docCategory,
        }),
      });
      if (!logResponse.ok) console.warn("Scan metadata was not saved:", await logResponse.json().catch(() => ({})));
    } catch (error) {
      console.error("Background metadata log skipped:", error);
    }

    // Reset & Return Home
    setIsProcessing(false);
    setCapturedPages([]);
    setDocTitle("");
    setActiveTab("home");
  };

  // Filter displayed documents
  const filteredDocs = documents.filter((doc) => {
    const matchesSearch = doc.title.toLowerCase().includes(searchQuery.toLowerCase());
    const matchesCat = selectedCategory === "All Docs" || doc.category === selectedCategory;
    return matchesSearch && matchesCat;
  });

  return (
    <div className="min-h-screen bg-[#F8F9FA] text-neutral-900 font-sans max-w-md mx-auto relative shadow-xl border-x border-neutral-200 flex flex-col">
      {/* Hidden local-only file inputs */}
      <input type="file" accept="application/pdf" multiple ref={pdfInputRef} onChange={mergePDFs} className="hidden" />
      <input
        type="file"
        accept="image/*"
        multiple
        ref={fileInputRef}
        onChange={handleGalleryUpload}
        className="hidden"
      />

      {/* ==================== 1. HOME SCREEN ==================== */}
      {activeTab === "home" && (
        <div className="flex-1 flex flex-col p-5 pb-28">
          {/* Header */}
          <div className="flex items-center justify-between mb-5">
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-neutral-900">SnapDoc AI</h1>
              <p className="text-xs text-emerald-600 font-medium">100% Free • No Login Required</p>
            </div>
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs bg-white border border-neutral-200 px-3 py-2 rounded-full font-medium shadow-sm hover:bg-neutral-50 flex items-center gap-1.5"
            >
              <ImageIcon className="w-3.5 h-3.5 text-emerald-600" />
              Import
            </button>
          </div>

          {/* Search Bar */}
          <div className="relative mb-5">
            <Search className="w-4 h-4 text-neutral-400 absolute left-3.5 top-3.5" />
            <input
              type="text"
              placeholder="Search scanned documents..."
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              className="w-full bg-white border border-neutral-200 rounded-2xl pl-10 pr-4 py-2.5 text-sm focus:outline-none focus:border-emerald-500 shadow-sm"
            />
          </div>

          {/* Category Filter Pills */}
          <div className="flex gap-2 overflow-x-auto pb-2 mb-5 no-scrollbar">
            {["All Docs", "ID Cards", "Invoices", "Notes"].map((cat) => (
              <button
                key={cat}
                onClick={() => setSelectedCategory(cat)}
                className={`px-4 py-1.5 rounded-full text-xs font-medium whitespace-nowrap transition-all ${
                  selectedCategory === cat
                    ? "bg-emerald-600 text-white shadow-sm"
                    : "bg-white text-neutral-700 border border-neutral-200 hover:bg-neutral-100"
                }`}
              >
                {cat}
              </button>
            ))}
          </div>

          {ocrText && (
            <div className="bg-white border border-emerald-200 rounded-2xl p-3 mb-4">
              <div className="flex items-center justify-between mb-2">
                <p className="text-xs font-semibold text-emerald-700">On-device OCR result</p>
                <button onClick={() => setOcrText("")} className="text-neutral-400"><X className="w-4 h-4" /></button>
              </div>
              <pre className="text-xs text-neutral-700 whitespace-pre-wrap break-words max-h-40 overflow-auto">{ocrText}</pre>
              <button onClick={() => navigator.clipboard?.writeText(ocrText)} className="mt-2 text-xs font-semibold text-emerald-700">Copy text</button>
            </div>
          )}
          {ocrBusy && <p className="text-xs text-emerald-700 mb-3">Running OCR on this device…</p>}

          {/* Quick Action Mini Tools */}
          <div className="grid grid-cols-3 gap-2.5 mb-6">
            <button
              onClick={startCamera}
              className="bg-white p-3 rounded-2xl border border-neutral-200 flex flex-col items-center gap-1.5 hover:border-emerald-500 transition"
            >
              <CreditCard className="w-5 h-5 text-emerald-600" />
              <span className="text-[11px] font-medium">ID Card</span>
            </button>
            <button
              onClick={runOCR}
              className="bg-white p-3 rounded-2xl border border-neutral-200 flex flex-col items-center gap-1.5 hover:border-emerald-500 transition"
            >
              <ScanText className="w-5 h-5 text-emerald-600" />
              <span className="text-[11px] font-medium">AI OCR</span>
            </button>
            <button
              onClick={() => pdfInputRef.current?.click()}
              className="bg-white p-3 rounded-2xl border border-neutral-200 flex flex-col items-center gap-1.5 hover:border-emerald-500 transition"
            >
              <Layers className="w-5 h-5 text-emerald-600" />
              <span className="text-[11px] font-medium">{mergeBusy ? "Merging..." : "Merge PDF"}</span>
            </button>
          </div>

          {/* Document List */}
          <div className="flex-1 space-y-3">
            <h2 className="text-xs font-semibold uppercase tracking-wider text-neutral-400">
              Recent Scans ({filteredDocs.length})
            </h2>

            {filteredDocs.length === 0 ? (
              <div className="bg-white border border-dashed border-neutral-300 rounded-3xl p-8 text-center mt-4">
                <FileText className="w-10 h-10 text-neutral-300 mx-auto mb-2" />
                <p className="text-sm font-medium text-neutral-700">No documents yet</p>
                <p className="text-xs text-neutral-400 mt-1">
                  Tap the green + button below to scan or import a document
                </p>
              </div>
            ) : (
              filteredDocs.map((doc) => (
                <div
                  key={doc.id}
                  className="bg-white p-3.5 rounded-2xl border border-neutral-200 flex items-center justify-between shadow-sm"
                >
                  <div className="flex items-center gap-3">
                    <div className="w-11 h-14 bg-emerald-50 rounded-lg border border-emerald-100 flex items-center justify-center overflow-hidden">
                      {doc.pages[0] ? (
                        <img src={doc.pages[0]} alt="thumb" className="w-full h-full object-cover" />
                      ) : (
                        <FileText className="w-5 h-5 text-emerald-600" />
                      )}
                    </div>
                    <div>
                      <h3 className="text-sm font-semibold text-neutral-800 line-clamp-1">
                        {doc.title}
                      </h3>
                      <p className="text-xs text-neutral-400 mt-0.5">
                        {doc.date} • {doc.size} • {doc.pages.length} Page(s)
                      </p>
                    </div>
                  </div>
                  <button
                    onClick={() => {
                      const updated = documents.filter((d) => d.id !== doc.id);
                      saveToLocal(updated);
                    }}
                    className="p-2 text-neutral-400 hover:text-red-500"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              ))
            )}
          </div>

          {/* Floating Apple Minimalist Bottom Navigation Bar */}
          <div className="fixed bottom-5 left-1/2 -translate-x-1/2 w-[90%] max-w-[380px] bg-emerald-600 text-white rounded-full px-6 py-3 shadow-lg flex items-center justify-between">
            <button onClick={() => setActiveTab("home")} className="flex flex-col items-center text-xs">
              <FileText className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Docs</span>
            </button>

            {/* Center Prominent + Scan Button */}
            <button
              onClick={startCamera}
              className="w-14 h-14 bg-white text-emerald-600 rounded-full flex items-center justify-center shadow-md -mt-8 border-4 border-[#F8F9FA] hover:scale-105 transition"
            >
              <Plus className="w-7 h-7 stroke-[2.5]" />
            </button>

            <button
              onClick={() => fileInputRef.current?.click()}
              className="flex flex-col items-center text-xs"
            >
              <ImageIcon className="w-5 h-5" />
              <span className="text-[10px] mt-0.5">Gallery</span>
            </button>
          </div>
        </div>
      )}

      {/* ==================== 2. LIVE CAMERA SCANNER ==================== */}
      {activeTab === "scan" && (
        <div className="flex-1 bg-black text-white flex flex-col justify-between p-5">
          <div className="flex justify-between items-center">
            <button
              onClick={() => {
                stopCamera();
                setActiveTab("home");
              }}
              className="p-2 bg-white/10 rounded-full"
            >
              <X className="w-5 h-5" />
            </button>
            <span className="text-xs font-medium bg-emerald-600 px-3 py-1 rounded-full">
              Pages Captured: {capturedPages.length}
            </span>
          </div>

          <div className="relative flex-1 my-4 rounded-2xl overflow-hidden border-2 border-emerald-500/70 flex items-center justify-center">
            {cameraActive ? (
              <video ref={videoRef} autoPlay playsInline className="w-full h-full object-cover" />
            ) : (
              <button
                onClick={() => fileInputRef.current?.click()}
                className="bg-emerald-600 px-5 py-3 rounded-xl text-sm font-medium"
              >
                Select Photo from Gallery
              </button>
            )}
          </div>

          <div className="flex items-center justify-between px-4 pb-4">
            <button
              onClick={() => fileInputRef.current?.click()}
              className="text-xs bg-white/15 px-4 py-2.5 rounded-full"
            >
              Gallery
            </button>

            <button
              onClick={capturePhoto}
              className="w-16 h-16 rounded-full border-4 border-white flex items-center justify-center bg-emerald-500 active:scale-95 transition"
            >
              <Camera className="w-6 h-6 text-white" />
            </button>

            <button
              disabled={capturedPages.length === 0}
              onClick={() => {
                stopCamera();
                setActiveTab("edit");
              }}
              className="text-xs bg-emerald-600 disabled:opacity-40 px-4 py-2.5 rounded-full font-semibold flex items-center gap-1"
            >
              Done <Check className="w-4 h-4" />
            </button>
          </div>
        </div>
      )}

      {/* ==================== 3. AI ENHANCE & EXPORT SCREEN ==================== */}
      {activeTab === "edit" && (
        <div className="flex-1 flex flex-col p-5 bg-white">
          <div className="flex items-center justify-between mb-4">
            <button
              onClick={() => {
                setCapturedPages([]);
                setActiveTab("home");
              }}
              className="text-sm text-neutral-500"
            >
              Cancel
            </button>
            <h2 className="text-sm font-bold">AI Enhance & Save</h2>
            <button
              onClick={handleSaveAndGeneratePDF}
              disabled={isProcessing}
              className="bg-emerald-600 text-white text-xs font-semibold px-4 py-2 rounded-full shadow-sm"
            >
              {isProcessing ? "Saving..." : "Save PDF"}
            </button>
          </div>

          {/* Document Title & Category Input */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="Document Name (e.g. CNIC, Invoice)"
              value={docTitle}
              onChange={(e) => setDocTitle(e.target.value)}
              className="flex-1 border border-neutral-200 rounded-xl px-3 py-2 text-xs focus:outline-none focus:border-emerald-500"
            />
            <select
              value={docCategory}
              onChange={(e) => setDocCategory(e.target.value as any)}
              className="border border-neutral-200 rounded-xl px-2 py-2 text-xs bg-neutral-50"
            >
              <option value="Notes">Notes</option>
              <option value="ID Cards">ID Cards</option>
              <option value="Invoices">Invoices</option>
            </select>
          </div>

          <div className="mb-3 flex items-center justify-between gap-3">
            <label className="text-xs font-medium text-neutral-600" htmlFor="pdf-format">PDF page size</label>
            <select id="pdf-format" value={pdfFormat} onChange={(e) => setPdfFormat(e.target.value as "a4" | "letter")} className="rounded-lg border border-neutral-200 bg-neutral-50 px-3 py-2 text-xs">
              <option value="a4">A4</option>
              <option value="letter">US Letter</option>
            </select>
          </div>

          <div className="mb-3">
            <div className="mb-2 flex items-center justify-between">
              <p className="text-xs font-semibold text-neutral-600">Pages ({capturedPages.length})</p>
              <span className="text-[10px] text-neutral-400">Reorder • Rotate • Remove</span>
            </div>
            <div className="flex gap-2 overflow-x-auto pb-2">
              {capturedPages.map((page, index) => (
                <div key={index} onClick={() => setSelectedPageIndex(index)} className={`w-24 shrink-0 rounded-xl border p-1.5 ${selectedPageIndex === index ? "border-emerald-500 bg-emerald-50" : "border-neutral-200 bg-neutral-50"}`}>
                  <img src={page} alt={`Page ${index + 1}`} className="h-20 w-full rounded-lg object-contain bg-white" />
                  <p className="my-1 text-center text-[10px] font-semibold text-neutral-600">Page {index + 1}</p>
                  <div className="flex justify-between gap-1">
                    <button onClick={() => movePage(index, -1)} disabled={index === 0} aria-label={`Move page ${index + 1} left`} className="rounded bg-white px-1.5 py-1 text-[10px] disabled:opacity-30">←</button>
                    <button onClick={() => rotatePage(index)} aria-label={`Rotate page ${index + 1}`} className="rounded bg-white px-1.5 py-1 text-[10px]">↻</button>
                    <button onClick={() => setCapturedPages((pages) => pages.filter((_, i) => i !== index))} aria-label={`Remove page ${index + 1}`} className="rounded bg-white px-1.5 py-1 text-[10px] text-red-600">×</button>
                    <button onClick={() => movePage(index, 1)} disabled={index === capturedPages.length - 1} aria-label={`Move page ${index + 1} right`} className="rounded bg-white px-1.5 py-1 text-[10px] disabled:opacity-30">→</button>
                  </div>
                </div>
              ))}
            </div>
          </div>

                    {/* Preview Image with Live AI Filter */}
          <div className="flex-1 bg-neutral-100 rounded-2xl p-4 flex items-center justify-center overflow-hidden border border-neutral-200">
            {capturedPages[0] && (
              <img
                src={capturedPages[selectedPageIndex] || capturedPages[0]}
                alt="Preview"
                style={{ filter: getFilterStyle(currentFilter) }}
                className="max-h-[360px] rounded-lg shadow-md transition-all duration-300"
              />
            )}
          </div>

          <div className="mt-4 rounded-xl border border-neutral-200 bg-neutral-50 p-3">
            <p className="mb-2 text-xs font-semibold text-neutral-700">Crop & straighten selected page</p>
            <div className="grid grid-cols-2 gap-x-3 gap-y-2">
              {(["top", "right", "bottom", "left"] as const).map((side) => (
                <label key={side} className="text-[10px] capitalize text-neutral-600">
                  {side}: {cropMargins[side]}%
                  <input type="range" min="0" max="35" value={cropMargins[side]} onChange={(e) => setCropMargins((m) => ({ ...m, [side]: Number(e.target.value) }))} className="block w-full" />
                </label>
              ))}
            </div>
            <div className="mt-2 flex items-center gap-2">
              <button onClick={() => cropPage(selectedPageIndex)} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold text-emerald-700 border border-emerald-200">Apply crop</button>
              <label className="flex-1 text-[10px] text-neutral-600">
                Straighten: {straightenAngle}°
                <input type="range" min="-15" max="15" step="0.5" value={straightenAngle} onChange={(e) => setStraightenAngle(Number(e.target.value))} className="block w-full" />
              </label>
              <button onClick={applyStraighten} className="rounded-lg bg-white px-3 py-2 text-xs font-semibold border border-neutral-200">Apply</button>
            </div>
          </div>

          <div className="mt-4 flex gap-2">
            <button onClick={runOCR} disabled={ocrBusy} className="flex-1 rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-700 disabled:opacity-50">
              {ocrBusy ? "Reading text…" : "Extract text (OCR)"}
            </button>
            <button onClick={() => setCapturedPages((pages) => pages.slice(0, -1))} disabled={capturedPages.length === 0} className="rounded-xl border border-neutral-200 px-3 py-2.5 text-xs text-neutral-600 disabled:opacity-40">
              Remove last page
            </button>
          </div>
          {ocrText && (
            <div className="mt-3 rounded-xl border border-emerald-100 bg-emerald-50 p-3">
              <div className="mb-1 flex items-center justify-between">
                <span className="text-xs font-semibold text-emerald-800">Extracted text (stays on this device)</span>
                <button onClick={() => setOcrText("")} className="text-xs text-emerald-700">Clear</button>
              </div>
              <pre className="max-h-32 overflow-auto whitespace-pre-wrap break-words text-xs text-neutral-700">{ocrText}</pre>
              <button onClick={() => navigator.clipboard?.writeText(ocrText)} className="mt-2 text-xs font-semibold text-emerald-700">Copy OCR text</button>
            </div>
          )}

          {/* AI Filters Selector */}
          <div className="mt-5">
            <p className="text-xs font-semibold text-neutral-500 mb-2 flex items-center gap-1">
              <Sparkles className="w-3.5 h-3.5 text-emerald-600" /> AI Enhancement Filters
            </p>
            <div className="grid grid-cols-4 gap-2">
              {[
                { id: "magic", label: "Magic Color" },
                { id: "bw", label: "Super B&W" },
                { id: "grayscale", label: "Grayscale" },
                { id: "clean", label: "Shadow Clean" },
                { id: "original", label: "Original" },
              ].map((f) => (
                <button
                  key={f.id}
                  onClick={() => setCurrentFilter(f.id)}
                  className={`py-2.5 px-2 rounded-xl text-xs font-medium border transition ${
                    currentFilter === f.id
                      ? "bg-emerald-600 text-white border-emerald-600"
                      : "bg-neutral-50 text-neutral-700 border-neutral-200"
                  }`}
                >
                  {f.label}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
                                            }
        

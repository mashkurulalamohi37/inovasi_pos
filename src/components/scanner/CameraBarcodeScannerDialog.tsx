import React, { useEffect, useRef, useState, useCallback } from "react";
import { Dialog, DialogContent, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import {
  Camera,
  Flashlight,
  Volume2,
  VolumeX,
  RefreshCw,
  AlertCircle,
  CheckCircle2,
  ScanLine,
  SwitchCamera,
  Image as ImageIcon,
  Copy,
  Check,
  Loader2,
} from "lucide-react";
import { Html5Qrcode, Html5QrcodeSupportedFormats } from "html5-qrcode";
import { toast } from "sonner";

export interface CameraBarcodeScannerDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onScan: (barcode: string) => void;
  title?: string;
  subtitle?: string;
  continuous?: boolean;
}

/** Synthesize a crisp POS scanner beep using Web Audio API (zero audio assets needed). */
export function playScannerBeep(success = true) {
  try {
    const AudioContextClass =
      window.AudioContext ||
      (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AudioContextClass) return;
    const ctx = new AudioContextClass();
    const osc = ctx.createOscillator();
    const gain = ctx.createGain();

    osc.type = "sine";
    if (success) {
      // 880Hz POS scanner beep
      osc.frequency.setValueAtTime(880, ctx.currentTime);
      gain.gain.setValueAtTime(0.18, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.12);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.12);
    } else {
      osc.frequency.setValueAtTime(320, ctx.currentTime);
      gain.gain.setValueAtTime(0.2, ctx.currentTime);
      gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.25);
      osc.connect(gain);
      gain.connect(ctx.destination);
      osc.start();
      osc.stop(ctx.currentTime + 0.25);
    }
  } catch {
    /* AudioContext might require user gesture on some browsers */
  }
}

export function triggerHaptic(durationMs = 80) {
  try {
    if ("vibrate" in navigator) {
      navigator.vibrate(durationMs);
    }
  } catch {
    /* ignore */
  }
}

const SUPPORTED_FORMATS = [
  Html5QrcodeSupportedFormats.EAN_13,
  Html5QrcodeSupportedFormats.EAN_8,
  Html5QrcodeSupportedFormats.UPC_A,
  Html5QrcodeSupportedFormats.UPC_E,
  Html5QrcodeSupportedFormats.CODE_128,
  Html5QrcodeSupportedFormats.CODE_39,
  Html5QrcodeSupportedFormats.CODE_93,
  Html5QrcodeSupportedFormats.CODABAR,
  Html5QrcodeSupportedFormats.ITF,
  Html5QrcodeSupportedFormats.QR_CODE,
];

export function CameraBarcodeScannerDialog({
  open,
  onOpenChange,
  onScan,
  title = "Camera Barcode Scanner",
  subtitle = "Point camera at product barcode or packaging",
  continuous = false,
}: CameraBarcodeScannerDialogProps) {
  const scannerRef = useRef<Html5Qrcode | null>(null);
  const containerId = useRef(`pulse-scanner-${Math.random().toString(36).slice(2, 9)}`).current;
  const cameraInputRef = useRef<HTMLInputElement | null>(null);
  const galleryInputRef = useRef<HTMLInputElement | null>(null);

  const isOpenRef = useRef(open);
  isOpenRef.current = open;

  const currentSessionIdRef = useRef(0);

  const [cameras, setCameras] = useState<Array<{ id: string; label: string }>>([]);
  const [activeCameraIndex, setActiveCameraIndex] = useState(0);
  const [torchOn, setTorchOn] = useState(false);
  const [hasTorch, setHasTorch] = useState(false);
  const [soundEnabled, setSoundEnabled] = useState(true);
  const [isContinuous, setIsContinuous] = useState(continuous);
  const [lastScanned, setLastScanned] = useState<string | null>(null);
  const [isScanning, setIsScanning] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [isProcessingPhoto, setIsProcessingPhoto] = useState(false);
  const [copiedUrl, setCopiedUrl] = useState(false);
  const [manualCode, setManualCode] = useState("");

  const lastScannedTimeRef = useRef<number>(0);
  const lastScannedCodeRef = useRef<string>("");

  /**
   * Hardware-level cleanup: Stop all MediaStream tracks and disconnect video elements.
   * This ensures the camera hardware light turns off completely.
   */
  const stopAllMediaTracks = useCallback(() => {
    try {
      const container = document.getElementById(containerId);
      if (container) {
        const videoElements = container.querySelectorAll("video");
        videoElements.forEach((vid) => {
          if (vid.srcObject && "getTracks" in (vid.srcObject as MediaStream)) {
            (vid.srcObject as MediaStream).getTracks().forEach((track) => {
              try {
                track.stop();
              } catch {}
            });
            vid.srcObject = null;
          }
          vid.pause();
        });
      }
    } catch {}

    try {
      if (scannerRef.current) {
        const stream = (scannerRef.current as any).localMediaStream;
        if (stream && "getTracks" in stream) {
          stream.getTracks().forEach((track: MediaStreamTrack) => {
            try {
              track.stop();
            } catch {}
          });
        }
      }
    } catch {}
  }, [containerId]);

  const stopScanner = useCallback(async () => {
    // Invalidate any in-progress start sessions
    currentSessionIdRef.current++;

    // Immediately stop hardware media tracks
    stopAllMediaTracks();

    const scanner = scannerRef.current;
    if (scanner) {
      scannerRef.current = null;
      try {
        if (scanner.isScanning) {
          await scanner.stop();
        }
        await scanner.clear();
      } catch {
        /* ignore */
      }
    }

    stopAllMediaTracks();
    setIsScanning(false);
    setTorchOn(false);
  }, [stopAllMediaTracks]);

  const handleScanSuccess = useCallback(
    (decodedText: string) => {
      const now = Date.now();
      // Debounce identical scans within 1.5 seconds in continuous mode
      if (
        isContinuous &&
        decodedText === lastScannedCodeRef.current &&
        now - lastScannedTimeRef.current < 1500
      ) {
        return;
      }

      lastScannedTimeRef.current = now;
      lastScannedCodeRef.current = decodedText;
      setLastScanned(decodedText);

      if (soundEnabled) {
        playScannerBeep(true);
      }
      triggerHaptic(80);

      onScan(decodedText);

      if (!isContinuous) {
        void stopScanner();
        onOpenChange(false);
      }
    },
    [isContinuous, soundEnabled, onScan, onOpenChange, stopScanner]
  );

  const handleManualSubmit = () => {
    const trimmed = manualCode.trim();
    if (!trimmed) return;
    setManualCode("");
    handleScanSuccess(trimmed);
  };

  const handleDirectPermissionRequest = async () => {
    try {
      if (navigator.mediaDevices?.getUserMedia) {
        await navigator.mediaDevices.getUserMedia({
          video: { facingMode: "environment" },
        });
      }
      toast.info("Connecting to camera...");
      void startScanner();
    } catch (err: unknown) {
      const msg = (err as { message?: string })?.message || "Permission request failed.";
      toast.error(msg);
      setErrorMsg(msg);
    }
  };

  const startScanner = useCallback(
    async (cameraIdOrFacing?: string | { facingMode: string }) => {
      setErrorMsg(null);
      setIsScanning(false);

      // Check if browser supports mediaDevices.getUserMedia
      if (!navigator.mediaDevices?.getUserMedia) {
        setErrorMsg("HTTP_SECURE_REQUIRED");
        return;
      }

      try {
        await stopScanner();

        const sessionId = ++currentSessionIdRef.current;

        // If closed while stopping previous session, abort
        if (!isOpenRef.current) {
          return;
        }

        const scanner = new Html5Qrcode(containerId, {
          formatsToSupport: SUPPORTED_FORMATS,
          verbose: false,
        });
        scannerRef.current = scanner;

        const cameraConfig =
          cameraIdOrFacing || { facingMode: "environment" };

        const startPromise = scanner.start(
          cameraConfig,
          {
            fps: 15,
            qrbox: { width: 240, height: 160 },
            aspectRatio: 1.333333,
          },
          handleScanSuccess,
          () => {
            /* quiet scan progress frame */
          }
        );

        const timeoutPromise = new Promise((_, reject) =>
          setTimeout(
            () => reject(new Error("Camera timed out while opening. Tap Retry Live to try again.")),
            10000
          )
        );

        await Promise.race([startPromise, timeoutPromise]);

        // Check if user closed dialog while start() was pending
        if (!isOpenRef.current) {
          await stopScanner();
          return;
        }

        setIsScanning(true);

        // Discover camera devices non-blockingly after stream has started
        void Html5Qrcode.getCameras().then((devices) => {
          if (devices && devices.length > 0) {
            setCameras(devices);
          }
        }).catch(() => {});

        // Check torch capabilities
        try {
          const track = scanner.getRunningTrackCameraCapabilities?.();
          if (track?.torchFeature?.().isSupported?.()) {
            setHasTorch(true);
          }
        } catch {
          setHasTorch(false);
        }
      } catch (err: unknown) {
        const message =
          (err as { message?: string })?.message ||
          "Could not access camera. Please check permissions.";
        console.error("[CameraScanner Error]:", message, err);
        toast.error(`Camera: ${message}`);

        const isSecure =
          window.isSecureContext ||
          location.protocol === "https:" ||
          location.hostname === "localhost" ||
          location.hostname === "127.0.0.1";

        if (
          message.includes("Permission") ||
          message.includes("NotAllowedError") ||
          message.includes("PermissionDeniedError")
        ) {
          setErrorMsg("Camera permission was denied. Tap the lock/tune icon next to the URL bar and allow Camera.");
        } else if (!isSecure && (message.includes("secure") || !navigator.mediaDevices?.getUserMedia)) {
          setErrorMsg("HTTP_SECURE_REQUIRED");
        } else {
          setErrorMsg(message);
        }
        setIsScanning(false);
      }
    },
    [containerId, cameras, activeCameraIndex, handleScanSuccess, stopScanner]
  );

  // File / Photo Capture Handler
  const handlePhotoFile = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingPhoto(true);
    try {
      let decodedValue: string | null = null;

      // 1. Try native BarcodeDetector API if available
      if (typeof window !== "undefined" && "BarcodeDetector" in window) {
        try {
          const BarcodeDetectorClass = (window as any).BarcodeDetector;
          const supported = await BarcodeDetectorClass.getSupportedFormats();
          const detector = new BarcodeDetectorClass({ formats: supported });
          const bitmap = await createImageBitmap(file);
          const results = await detector.detect(bitmap);
          if (results && results.length > 0 && results[0].rawValue) {
            decodedValue = results[0].rawValue;
          }
        } catch {
          /* Fall through to Html5Qrcode */
        }
      }

      // 2. Fallback to Html5Qrcode scanFile
      if (!decodedValue) {
        await stopScanner();
        let scanner = scannerRef.current;
        if (!scanner) {
          scanner = new Html5Qrcode(containerId, {
            formatsToSupport: SUPPORTED_FORMATS,
            verbose: false,
          });
          scannerRef.current = scanner;
        }
        decodedValue = await scanner.scanFile(file, false);
      }

      if (decodedValue) {
        toast.success(`Scanned: ${decodedValue}`);
        handleScanSuccess(decodedValue);
      } else {
        toast.error("No barcode detected in photo. Please ensure barcode is sharp, well-lit, and in focus.");
      }
    } catch {
      toast.error("Could not read barcode from photo. Please try a clearer shot or type it below.");
    } finally {
      setIsProcessingPhoto(false);
      if (cameraInputRef.current) cameraInputRef.current.value = "";
      if (galleryInputRef.current) galleryInputRef.current.value = "";
    }
  };

  useEffect(() => {
    if (open) {
      setLastScanned(null);
      void startScanner();
    } else {
      void stopScanner();
    }

    return () => {
      void stopScanner();
    };
  }, [open, startScanner, stopScanner]);

  const handleDialogClose = (newOpen: boolean) => {
    if (!newOpen) {
      void stopScanner();
    }
    onOpenChange(newOpen);
  };

  const toggleTorch = async () => {
    if (!scannerRef.current || !hasTorch) return;
    try {
      const nextTorch = !torchOn;
      await scannerRef.current.applyVideoConstraints({
        advanced: [{ torch: nextTorch } as any],
      });
      setTorchOn(nextTorch);
    } catch {
      /* torch toggle failed */
    }
  };

  const flipCamera = async () => {
    if (cameras.length <= 1) return;
    const nextIndex = (activeCameraIndex + 1) % cameras.length;
    setActiveCameraIndex(nextIndex);
    await startScanner(cameras[nextIndex]?.id);
  };

  const copyOriginForFlags = () => {
    if (typeof window === "undefined") return;
    navigator.clipboard.writeText(window.location.origin);
    setCopiedUrl(true);
    toast.success("Copied origin URL to clipboard");
    setTimeout(() => setCopiedUrl(false), 2500);
  };

  return (
    <Dialog open={open} onOpenChange={handleDialogClose}>
      <DialogContent className="sm:max-w-md p-0 overflow-hidden bg-background border border-border shadow-2xl">
        {/* Hidden File Inputs for Native Camera and Gallery (Works on plain HTTP) */}
        <input
          ref={cameraInputRef}
          type="file"
          accept="image/*"
          capture="environment"
          className="hidden"
          onChange={handlePhotoFile}
        />
        <input
          ref={galleryInputRef}
          type="file"
          accept="image/*"
          className="hidden"
          onChange={handlePhotoFile}
        />

        <DialogHeader className="p-4 pb-2 border-b border-border/60">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className="grid h-8 w-8 place-items-center rounded-lg bg-primary/10 text-primary">
                <Camera className="h-4 w-4" />
              </div>
              <div>
                <DialogTitle className="text-sm font-semibold">{title}</DialogTitle>
                <p className="text-[11px] text-muted-foreground">{subtitle}</p>
              </div>
            </div>
            <div className="flex items-center gap-1.5 mr-6">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-7 w-7 text-muted-foreground hover:text-foreground"
                onClick={() => setSoundEnabled((s) => !s)}
                title={soundEnabled ? "Mute beep sound" : "Enable beep sound"}
              >
                {soundEnabled ? (
                  <Volume2 className="h-3.5 w-3.5" />
                ) : (
                  <VolumeX className="h-3.5 w-3.5 text-muted-foreground" />
                )}
              </Button>
              {cameras.length > 1 && isScanning && (
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  className="h-7 w-7 text-muted-foreground hover:text-foreground"
                  onClick={flipCamera}
                  title="Switch camera"
                >
                  <SwitchCamera className="h-3.5 w-3.5" />
                </Button>
              )}
              {hasTorch && isScanning && (
                <Button
                  type="button"
                  variant={torchOn ? "default" : "ghost"}
                  size="icon"
                  className={`h-7 w-7 ${
                    torchOn
                      ? "bg-amber-500 text-white hover:bg-amber-600"
                      : "text-muted-foreground hover:text-foreground"
                  }`}
                  onClick={toggleTorch}
                  title="Toggle flashlight"
                >
                  <Flashlight className="h-3.5 w-3.5" />
                </Button>
              )}
            </div>
          </div>
        </DialogHeader>

        {/* Viewfinder or Fallback Action Area */}
        <div className="relative w-full h-[280px] bg-black overflow-hidden flex items-center justify-center">
          {/* HTML5 QR Container (Always in DOM for scanner engine) */}
          <div
            id={containerId}
            className="absolute inset-0 w-full h-full [&_video]:w-full [&_video]:h-full [&_video]:object-cover"
          />

          {/* Starting / Connecting Indicator */}
          {!isScanning && !errorMsg && !isProcessingPhoto && (
            <div className="absolute inset-0 bg-black/85 z-10 flex flex-col items-center justify-center gap-2.5 p-4 text-center">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
              <div className="text-xs font-semibold text-white">Starting camera...</div>
              <p className="text-[11px] text-white/70 max-w-xs">
                If camera does not open automatically, tap below:
              </p>
              <Button
                type="button"
                size="sm"
                className="gap-1.5 bg-primary text-primary-foreground font-semibold px-4 shadow-md text-xs h-8 cursor-pointer"
                onClick={handleDirectPermissionRequest}
              >
                <Camera className="h-3.5 w-3.5" /> Tap to Allow Camera
              </Button>
            </div>
          )}

          {/* Real-time Video Scanner Overlay */}
          {isScanning && (
            <div className="absolute inset-0 pointer-events-none flex flex-col items-center justify-center">
              <div className="relative w-[80%] h-[58%] rounded-xl border border-white/20 shadow-[0_0_0_9999px_rgba(0,0,0,0.45)]">
                <div className="absolute -top-1 -left-1 w-6 h-6 border-t-3 border-l-3 border-emerald-400 rounded-tl-lg" />
                <div className="absolute -top-1 -right-1 w-6 h-6 border-t-3 border-r-3 border-emerald-400 rounded-tr-lg" />
                <div className="absolute -bottom-1 -left-1 w-6 h-6 border-b-3 border-l-3 border-emerald-400 rounded-bl-lg" />
                <div className="absolute -bottom-1 -right-1 w-6 h-6 border-b-3 border-r-3 border-emerald-400 rounded-br-lg" />
                <div className="absolute inset-x-0 h-0.5 bg-gradient-to-r from-transparent via-red-500 to-transparent shadow-[0_0_12px_2px_rgba(239,68,68,0.8)] animate-[scanLaser_2s_ease-in-out_infinite]" />
              </div>

              <div className="absolute bottom-3 flex items-center gap-1.5 px-3 py-1 rounded-full bg-black/75 backdrop-blur-md text-[11px] text-white/90 border border-white/10">
                <ScanLine className="h-3 w-3 text-emerald-400 animate-pulse" />
                <span>Center barcode in box</span>
              </div>
            </div>
          )}

          {/* Processing Photo Indicator */}
          {isProcessingPhoto && (
            <div className="absolute inset-0 bg-background/90 z-20 flex flex-col items-center justify-center gap-2 p-4 text-center">
              <Loader2 className="h-7 w-7 text-primary animate-spin" />
              <div className="text-xs font-semibold text-foreground">Analyzing barcode from photo...</div>
              <div className="text-[11px] text-muted-foreground">Decoding barcode data</div>
            </div>
          )}

          {/* Fallback Camera Interface (Only when browser has an error or permission denial) */}
          {errorMsg && !isProcessingPhoto && (
            <div className="absolute inset-0 p-4 flex flex-col items-center justify-center text-center bg-card z-10 overflow-y-auto">
              <div className="h-10 w-10 rounded-full bg-primary/10 text-primary grid place-items-center mb-2 shrink-0">
                <Camera className="h-5 w-5" />
              </div>

              <h4 className="text-sm font-semibold mb-1 text-foreground">
                {errorMsg === "HTTP_SECURE_REQUIRED" ? "Live Camera Requires HTTPS or Flag" : "Camera Access"}
              </h4>

              <p className="text-[11px] text-muted-foreground max-w-xs mb-3">
                {errorMsg === "HTTP_SECURE_REQUIRED"
                  ? "Live streaming is blocked on HTTP. Tap below to snap with your camera or enable live stream:"
                  : errorMsg || "Use camera capture or type barcode below:"}
              </p>

              {/* Primary Native Camera Snap Button (Works on plain HTTP) */}
              <div className="w-full max-w-xs flex flex-col gap-2 mb-2">
                <Button
                  type="button"
                  size="default"
                  className="w-full gap-2 bg-primary text-primary-foreground font-semibold shadow-md h-9 text-xs"
                  onClick={() => cameraInputRef.current?.click()}
                  disabled={isProcessingPhoto}
                >
                  <Camera className="h-4 w-4" /> Snap Barcode with Camera
                </Button>

                <div className="flex items-center gap-1.5">
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="flex-1 gap-1 text-[11px] h-7.5"
                    onClick={() => galleryInputRef.current?.click()}
                  >
                    <ImageIcon className="h-3.5 w-3.5" /> From Gallery
                  </Button>
                  <Button
                    type="button"
                    variant="outline"
                    size="sm"
                    className="gap-1 text-[11px] h-7.5 px-2.5"
                    onClick={() => startScanner()}
                  >
                    <RefreshCw className="h-3 w-3" /> Retry Live
                  </Button>
                </div>
              </div>

              {/* Chrome/Brave HTTP Flag Instruction Callout */}
              <div className="mt-2 p-2 rounded-lg bg-amber-500/10 border border-amber-500/20 text-[10px] text-amber-800 dark:text-amber-300 max-w-xs text-left space-y-1">
                <div className="font-semibold flex items-center justify-between">
                  <span>To enable Live Video on HTTP:</span>
                  <button
                    type="button"
                    onClick={copyOriginForFlags}
                    className="inline-flex items-center gap-0.5 text-[9.5px] px-1.5 py-0.5 rounded bg-amber-500/20 hover:bg-amber-500/30 text-amber-900 dark:text-amber-200 transition-colors cursor-pointer"
                  >
                    {copiedUrl ? <Check className="h-2.5 w-2.5 text-emerald-600" /> : <Copy className="h-2.5 w-2.5" />}
                    {copiedUrl ? "Copied" : "Copy URL"}
                  </button>
                </div>
                <p className="leading-tight text-slate-700 dark:text-slate-300">
                  Open <code>chrome://flags/#unsafely-treat-insecure-origin-as-secure</code>, enable it, and paste this URL.
                </p>
              </div>
            </div>
          )}
        </div>

        {/* Footer: Unified Single Manual Barcode Input & Continuous Mode Toggle */}
        <div className="p-3 bg-muted/20 border-t border-border flex flex-col gap-2">
          <div className="flex items-center gap-1.5">
            <Input
              placeholder="Or type/paste barcode (Enter to add)..."
              value={manualCode}
              onChange={(e) => setManualCode(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") handleManualSubmit();
              }}
              className="h-8 text-xs font-mono flex-1 bg-background"
            />
            <Button
              size="sm"
              variant="default"
              className="h-8 px-3 text-xs shrink-0 font-medium"
              onClick={handleManualSubmit}
              disabled={!manualCode.trim()}
            >
              Add Item
            </Button>
          </div>

          <div className="flex items-center justify-between text-xs pt-0.5">
            <div className="flex items-center gap-2">
              <Switch
                id="continuous-mode"
                checked={isContinuous}
                onCheckedChange={setIsContinuous}
              />
              <Label htmlFor="continuous-mode" className="text-[11px] cursor-pointer text-muted-foreground">
                Continuous scan
              </Label>
            </div>

            {lastScanned ? (
              <Badge variant="outline" className="gap-1 bg-emerald-500/10 text-emerald-600 border-emerald-500/30 text-[11px] font-mono">
                <CheckCircle2 className="h-3 w-3" />
                <span>{lastScanned}</span>
              </Badge>
            ) : (
              <span className="text-[10px] text-muted-foreground">Ready to scan</span>
            )}
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

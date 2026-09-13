import { useCallback, useEffect, useRef, useState } from "react";
import { Button } from "../ui/Button";
import { Spinner } from "../ui/Screen";

/**
 * On-device QR scanner. Frames are read straight from getUserMedia into a
 * canvas and run through jsQR in this tab — nothing is uploaded or logged.
 * The preference for a rear camera is expressed as "ideal" so desktop
 * webcams and devices without a rear camera still work via the fallback.
 */

type ScannerStatus = "idle" | "starting" | "scanning" | "denied" | "unavailable" | "error";

export function QrScanner({
  onResult,
}: {
  /** Return true when the scanned text was accepted (camera stops), false to re-arm. */
  onResult: (text: string) => boolean;
}) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const streamRef = useRef<MediaStream | null>(null);
  const rafRef = useRef<number | null>(null);
  const jsqrRef = useRef<typeof import("jsqr").default | null>(null);
  const aliveRef = useRef(true);
  const lastInvalidAtRef = useRef(0);
  const bannerTimerRef = useRef<number | null>(null);
  const onResultRef = useRef(onResult);

  const [status, setStatus] = useState<ScannerStatus>("idle");
  const [banner, setBanner] = useState<string | null>(null);

  function clearBanner() {
    if (bannerTimerRef.current !== null) window.clearTimeout(bannerTimerRef.current);
    bannerTimerRef.current = null;
    setBanner(null);
  }

  const stop = useCallback(() => {
    if (rafRef.current !== null) {
      cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    }
    const video = videoRef.current;
    if (video) video.srcObject = null;
    streamRef.current?.getTracks().forEach((track) => track.stop());
    streamRef.current = null;
    clearBanner();
    setStatus("idle");
  }, []);

  useEffect(() => {
    aliveRef.current = true;
    return () => {
      aliveRef.current = false;
      stop();
    };
  }, [stop]);

  const renderFrame = useCallback(() => {
    const video = videoRef.current;
    const canvas = canvasRef.current;
    const jsQR = jsqrRef.current;
    if (!video || !canvas || !jsQR) return;
    if (video.readyState < 2 || video.videoWidth === 0) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    const ctx = canvas.getContext("2d", { willReadFrequently: true });
    if (!ctx) {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    ctx.drawImage(video, 0, 0);
    let imageData: ImageData;
    try {
      imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    } catch {
      rafRef.current = requestAnimationFrame(renderFrame);
      return;
    }
    const code = jsQR(imageData.data, imageData.width, imageData.height, {
      inversionAttempts: "attemptBoth",
    });
    if (code?.data) {
      const accepted = onResultRef.current(code.data);
      if (accepted) {
        stop();
        return;
      }
      const now = Date.now();
      if (now - lastInvalidAtRef.current > 1500) {
        lastInvalidAtRef.current = now;
        setBanner("That isn't a Family Orders pairing code — try again.");
        if (bannerTimerRef.current) window.clearTimeout(bannerTimerRef.current);
        bannerTimerRef.current = window.setTimeout(() => setBanner(null), 2500);
      }
    }
    rafRef.current = requestAnimationFrame(renderFrame);
  }, [stop]);

  const start = useCallback(async () => {
    if (!navigator.mediaDevices?.getUserMedia) {
      setStatus("unavailable");
      return;
    }
    clearBanner();
    setStatus("starting");
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: false,
        video: {
          facingMode: { ideal: "environment" },
          width: { ideal: 1280 },
          height: { ideal: 720 },
        },
      });
      if (!aliveRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      streamRef.current = stream;
      const video = videoRef.current;
      if (video) {
        video.srcObject = stream;
        await video.play().catch(() => {});
      }
      if (!jsqrRef.current) {
        const mod = await import("jsqr");
        jsqrRef.current = mod.default;
      }
      if (!aliveRef.current) {
        stop();
        return;
      }
      setStatus("scanning");
      rafRef.current = requestAnimationFrame(renderFrame);
    } catch (err) {
      const name = (err as DOMException)?.name;
      if (
        name === "NotAllowedError" ||
        name === "PermissionDeniedError" ||
        name === "SecurityError"
      ) {
        setStatus("denied");
      } else if (
        name === "NotFoundError" ||
        name === "DevicesNotFoundError" ||
        name === "OverconstrainedError"
      ) {
        setStatus("unavailable");
      } else {
        setStatus("error");
      }
    }
  }, [renderFrame, stop]);

  return (
    <div className="mt-2 rounded-md border-2 border-ink bg-surface p-3 shadow-[3px_4px_0_0_var(--fo-ink)]">
      {status === "idle" ? (
        <div className="flex flex-col items-center gap-3 py-2 text-center">
          <CameraIcon className="h-12 w-12 animate-float" />
          <p className="text-sm font-bold text-ink">Point this phone at the QR code.</p>
          <p className="max-w-xs text-xs text-muted">
            The code is read on-device — the camera feed never leaves this phone.
          </p>
          <Button variant="secondary" className="w-full" onClick={() => void start()}>
            Open camera / Scan QR
          </Button>
        </div>
      ) : null}

      {status === "starting" ? <Spinner label="Turning on camera…" /> : null}

      <div
        className={`relative aspect-square w-full overflow-hidden rounded-sm border border-ink/30 bg-ink ${
          status === "scanning" ? "block" : "hidden"
        }`}
      >
        <video
          ref={videoRef}
          autoPlay
          playsInline
          muted
          className="absolute inset-0 h-full w-full object-cover"
        />
        <div className="pointer-events-none absolute inset-4">
          <span className="absolute left-0 top-0 h-10 w-10 rounded-tl-lg border-4 border-gold border-r-0 border-b-0" />
          <span className="absolute right-0 top-0 h-10 w-10 rounded-tr-lg border-4 border-gold border-l-0 border-b-0" />
          <span className="absolute bottom-0 left-0 h-10 w-10 rounded-bl-lg border-4 border-gold border-r-0 border-t-0" />
          <span className="absolute bottom-0 right-0 h-10 w-10 rounded-br-lg border-4 border-gold border-l-0 border-t-0" />
        </div>
        {banner ? (
          <p className="absolute inset-x-4 bottom-4 rounded-sm border border-tomato bg-canvas/90 px-3 py-2 text-center text-xs font-bold text-danger">
            {banner}
          </p>
        ) : null}
        <canvas ref={canvasRef} className="hidden" />
      </div>

      {status === "scanning" ? (
        <div className="mt-3 flex items-center justify-between gap-2">
          <p className="text-xs font-semibold text-muted">Keep the code inside the frame.</p>
          <Button variant="ghost" size="sm" onClick={() => void stop()}>
            Cancel
          </Button>
        </div>
      ) : null}

      {status === "denied" ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <p className="text-sm font-bold text-danger">Camera access is turned off.</p>
          <p className="max-w-xs text-xs text-muted">
            Allow camera access for this site in your browser or phone settings, then try again —
            or paste the invite text below.
          </p>
          <div className="flex w-full gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void start()}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => void stop()}>
              Close
            </Button>
          </div>
        </div>
      ) : null}

      {status === "unavailable" ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <p className="text-sm font-bold text-ink">No camera was found on this device.</p>
          <p className="max-w-xs text-xs text-muted">
            You can still pair by copying the invite text from the other phone and pasting it
            below.
          </p>
          <Button variant="ghost" onClick={() => void stop()}>
            Close
          </Button>
        </div>
      ) : null}

      {status === "error" ? (
        <div className="flex flex-col items-center gap-2 py-2 text-center">
          <p className="text-sm font-bold text-ink">Couldn't start the camera.</p>
          <p className="max-w-xs text-xs text-muted">
            Something went wrong opening the camera. Paste the invite text below to pair instead.
          </p>
          <div className="flex w-full gap-2">
            <Button variant="secondary" className="flex-1" onClick={() => void start()}>
              Try again
            </Button>
            <Button variant="ghost" onClick={() => void stop()}>
              Close
            </Button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function CameraIcon(props: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" fill="none" aria-hidden="true" {...props}>
      <path
        d="M3 8.5c0-1.7 1.3-3 3-3h2.2l1.2-2h5.2l1.2 2H18c1.7 0 3 1.3 3 3v9c0 1.7-1.3 3-3 3H6c-1.7 0-3-1.3-3-3v-9Z"
        stroke="var(--fo-ink, #2a1c0e)"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="12" cy="13" r="3.6" stroke="var(--fo-ink, #2a1c0e)" strokeWidth="2" />
      <circle cx="17.2" cy="8" r="1.4" fill="var(--fo-tomato, #ef4020)" />
    </svg>
  );
}
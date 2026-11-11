"use client";

import { useEffect, useRef, useState } from "react";
import jsQR from "jsqr";

const TOKEN_PATTERN = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i;

export function extractToken(value: string): string | null {
  try {
    const url = new URL(value);
    const match = url.pathname.match(/\/attend\/([^/?#]+)/);
    if (match) return decodeURIComponent(match[1]);
  } catch {
    // Not a URL; fall through to a raw token match.
  }
  return value.match(TOKEN_PATTERN)?.[0] ?? null;
}

export function QrScanner({ onToken }: { onToken: (token: string) => void }) {
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [status, setStatus] = useState<"starting" | "scanning" | "error">("starting");
  const [message, setMessage] = useState("");

  useEffect(() => {
    let stream: MediaStream | null = null;
    let frame = 0;
    let stopped = false;

    async function start() {
      if (!navigator.mediaDevices?.getUserMedia) {
        setStatus("error");
        setMessage("Camera access needs HTTPS (or localhost) and a supported browser.");
        return;
      }
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" } },
          audio: false,
        });
      } catch (error) {
        setStatus("error");
        setMessage(error instanceof DOMException && error.name === "NotAllowedError"
          ? "Camera permission was denied. Allow camera access in your browser settings and try again."
          : "Could not start the camera on this device.");
        return;
      }
      if (stopped || !videoRef.current) {
        stream.getTracks().forEach((track) => track.stop());
        return;
      }
      videoRef.current.srcObject = stream;
      await videoRef.current.play().catch(() => undefined);
      setStatus("scanning");
      tick();
    }

    function tick() {
      if (stopped) return;
      const video = videoRef.current;
      const canvas = canvasRef.current;
      if (video && canvas && video.readyState === video.HAVE_ENOUGH_DATA) {
        canvas.width = video.videoWidth;
        canvas.height = video.videoHeight;
        const context = canvas.getContext("2d", { willReadFrequently: true });
        if (context) {
          context.drawImage(video, 0, 0, canvas.width, canvas.height);
          const image = context.getImageData(0, 0, canvas.width, canvas.height);
          const code = jsQR(image.data, image.width, image.height, { inversionAttempts: "dontInvert" });
          const token = code ? extractToken(code.data) : null;
          if (token) {
            stopped = true;
            stream?.getTracks().forEach((track) => track.stop());
            onToken(token);
            return;
          }
        }
      }
      frame = requestAnimationFrame(tick);
    }

    start();

    return () => {
      stopped = true;
      cancelAnimationFrame(frame);
      stream?.getTracks().forEach((track) => track.stop());
    };
  }, [onToken]);

  return (
    <div className="scanner-frame" style={{ position: "relative", overflow: "hidden" }}>
      <video
        ref={videoRef}
        muted
        playsInline
        style={{ width: "100%", height: "100%", objectFit: "cover", display: status === "scanning" ? "block" : "none" }}
      />
      <canvas ref={canvasRef} style={{ display: "none" }} />
      {status !== "scanning" && (
        <div className="scanner-placeholder">
          <div className="scan-corners"><i /><i /><i /><i /><span>▦</span></div>
          <p>{status === "starting" ? "Starting camera…" : message}</p>
        </div>
      )}
    </div>
  );
}

import { useEffect, useRef, useState } from "react";

import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";

type Mode = "draw" | "upload";

export function SignatureField({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (dataUrl: string) => void;
}) {
  const [open, setOpen] = useState(false);
  const [draft, setDraft] = useState(value);

  function openEditor() {
    setDraft(value);
    setOpen(true);
  }

  function apply() {
    onChange(draft);
    setOpen(false);
  }

  return (
    <div className="mt-3 border-t pt-3">
      <div className="flex items-center justify-between gap-2">
        <p className="lbl mb-0">Employee signature</p>
        <div className="flex items-center gap-2">
          {value ? (
            <button
              type="button"
              className="text-xs text-muted-foreground underline-offset-2 hover:underline"
              disabled={disabled}
              onClick={() => onChange("")}
            >
              Clear
            </button>
          ) : null}
          <button type="button" className="btn btn-outline" disabled={disabled} onClick={openEditor}>
            {value ? "Edit signature" : "Add signature"}
          </button>
        </div>
      </div>

      <button
        type="button"
        disabled={disabled}
        onClick={openEditor}
        className="mt-2 flex h-14 w-full items-center justify-center rounded-md border border-dashed border-border bg-background px-3"
      >
        {value ? (
          <img src={value} alt="Signature preview" className="max-h-12 max-w-full object-contain" />
        ) : (
          <span className="text-xs text-muted-foreground">No signature yet — click to draw or upload</span>
        )}
      </button>

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-xl bg-card">
          <DialogHeader>
            <DialogTitle>Employee signature</DialogTitle>
          </DialogHeader>
          {open ? <SignaturePad key={value || "new"} value={draft} disabled={disabled} onChange={setDraft} /> : null}
          <DialogFooter>
            <button type="button" className="btn btn-outline" onClick={() => setOpen(false)}>
              Cancel
            </button>
            <button type="button" className="btn btn-primary" disabled={disabled} onClick={apply}>
              Use signature
            </button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}

function SignaturePad({
  value,
  disabled,
  onChange,
}: {
  value: string;
  disabled: boolean;
  onChange: (dataUrl: string) => void;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const fileRef = useRef<HTMLInputElement>(null);
  const [mode, setMode] = useState<Mode>("draw");

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || mode !== "draw") return;

    const paint = () => {
      const ctx = canvas.getContext("2d");
      if (!ctx) return;
      const dpr = window.devicePixelRatio || 1;
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      if (width < 2 || height < 2) return;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      ctx.lineWidth = 2.25;
      ctx.lineCap = "round";
      ctx.lineJoin = "round";
      ctx.strokeStyle = "#1a1a1a";
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, width, height);
      if (value.startsWith("data:image")) {
        const img = new Image();
        img.onload = () => ctx.drawImage(img, 0, 0, width, height);
        img.src = value;
      }
    };

    const frame = requestAnimationFrame(paint);
    return () => cancelAnimationFrame(frame);
    // Only reset the canvas when opening draw mode — not on every stroke commit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode]);

  function point(e: React.PointerEvent<HTMLCanvasElement>) {
    const canvas = canvasRef.current;
    if (!canvas) return { x: 0, y: 0 };
    const rect = canvas.getBoundingClientRect();
    return { x: e.clientX - rect.left, y: e.clientY - rect.top };
  }

  function commitCanvas() {
    const canvas = canvasRef.current;
    if (!canvas) return;
    onChange(canvas.toDataURL("image/png"));
  }

  function onPointerDown(e: React.PointerEvent<HTMLCanvasElement>) {
    if (disabled) return;
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (!canvas || !ctx) return;
    drawing.current = true;
    canvas.setPointerCapture(e.pointerId);
    const { x, y } = point(e);
    ctx.beginPath();
    ctx.moveTo(x, y);
  }

  function onPointerMove(e: React.PointerEvent<HTMLCanvasElement>) {
    if (!drawing.current || disabled) return;
    const ctx = canvasRef.current?.getContext("2d");
    if (!ctx) return;
    const { x, y } = point(e);
    ctx.lineTo(x, y);
    ctx.stroke();
  }

  function onPointerUp() {
    if (!drawing.current) return;
    drawing.current = false;
    commitCanvas();
  }

  function clear() {
    onChange("");
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext("2d");
    if (canvas && ctx) {
      ctx.fillStyle = "#ffffff";
      ctx.fillRect(0, 0, canvas.clientWidth, canvas.clientHeight);
    }
    if (fileRef.current) fileRef.current.value = "";
  }

  function onUpload(file: File) {
    if (!file.type.startsWith("image/")) return;
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === "string" ? reader.result : "";
      onChange(result);
      setMode("upload");
    };
    reader.readAsDataURL(file);
  }

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          className={`btn ${mode === "draw" ? "btn-primary" : "btn-outline"}`}
          disabled={disabled}
          onClick={() => setMode("draw")}
        >
          Draw
        </button>
        <button
          type="button"
          className={`btn ${mode === "upload" ? "btn-primary" : "btn-outline"}`}
          disabled={disabled}
          onClick={() => setMode("upload")}
        >
          Upload
        </button>
        <input
          ref={fileRef}
          type="file"
          accept="image/png,image/jpeg,image/jpg"
          className="hidden"
          disabled={disabled}
          onChange={(e) => {
            const f = e.target.files?.[0];
            if (f) onUpload(f);
            e.target.value = "";
          }}
        />
        {value ? (
          <button type="button" className="btn btn-outline" disabled={disabled} onClick={clear}>
            Clear
          </button>
        ) : null}
      </div>

      {mode === "draw" ? (
        <canvas
          ref={canvasRef}
          className="h-40 w-full cursor-crosshair rounded-md border border-border bg-white touch-none"
          onPointerDown={onPointerDown}
          onPointerMove={onPointerMove}
          onPointerUp={onPointerUp}
          onPointerLeave={onPointerUp}
        />
      ) : (
        <button
          type="button"
          disabled={disabled}
          onClick={() => fileRef.current?.click()}
          onDragOver={(e) => {
            e.preventDefault();
            e.stopPropagation();
          }}
          onDrop={(e) => {
            e.preventDefault();
            e.stopPropagation();
            if (disabled) return;
            const f = e.dataTransfer.files?.[0];
            if (f) onUpload(f);
          }}
          className="flex h-40 w-full cursor-pointer items-center justify-center rounded-md border border-dashed border-border bg-background disabled:cursor-not-allowed"
        >
          {value ? (
            <img src={value} alt="Uploaded signature" className="max-h-36 max-w-full object-contain" />
          ) : (
            <p className="text-xs text-muted-foreground">
              Click to browse, or drag and drop a PNG or JPG
            </p>
          )}
        </button>
      )}
    </div>
  );
}

import { ImagePlus, Upload } from "lucide-react";
import { useCallback, useRef, useState } from "react";
import { cn } from "@/lib/utils";

interface Props {
  onFile: (file: File) => void;
  fileName?: string | undefined;
  dims?: { width: number; height: number } | undefined;
  compact?: boolean | undefined;
}

export function Dropzone({ onFile, fileName, dims, compact }: Props) {
  const input = useRef<HTMLInputElement>(null);
  const [over, setOver] = useState(false);

  const handle = useCallback(
    (files: FileList | null) => {
      const f = files?.[0];
      if (f && f.type.startsWith("image/")) onFile(f);
    },
    [onFile],
  );

  return (
    <div
      role="button"
      tabIndex={0}
      onClick={() => input.current?.click()}
      onKeyDown={(e) => (e.key === "Enter" || e.key === " ") && input.current?.click()}
      onDragOver={(e) => {
        e.preventDefault();
        setOver(true);
      }}
      onDragLeave={() => setOver(false)}
      onDrop={(e) => {
        e.preventDefault();
        setOver(false);
        handle(e.dataTransfer.files);
      }}
      className={cn(
        "group flex cursor-pointer flex-col items-center justify-center gap-2 rounded-lg border border-dashed border-border bg-surface/50 text-center transition-colors hover:border-primary/60 hover:bg-surface focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring",
        over && "border-primary bg-primary/10",
        compact ? "px-3 py-3" : "px-4 py-8",
      )}
    >
      <input
        ref={input}
        type="file"
        accept="image/*"
        className="sr-only"
        onChange={(e) => handle(e.target.files)}
      />
      {fileName ? (
        <>
          <ImagePlus className="size-4 text-primary" />
          <div className="min-w-0 text-xs">
            <div className="truncate font-medium">{fileName}</div>
            {dims && (
              <div className="font-mono text-[11px] text-muted-foreground">
                {dims.width}×{dims.height} px · clique para trocar
              </div>
            )}
          </div>
        </>
      ) : (
        <>
          <Upload className="size-5 text-muted-foreground transition-colors group-hover:text-primary" />
          <div className="text-sm">Arraste uma imagem ou clique</div>
          <div className="font-mono text-[11px] text-muted-foreground">PNG · JPG · GIF · WEBP</div>
        </>
      )}
    </div>
  );
}
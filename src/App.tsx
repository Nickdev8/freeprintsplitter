import { useEffect, useMemo, useRef, useState } from "react";

type LoadedImage = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  image: HTMLImageElement;
};

const CM_WIDTH = 15;
const CM_HEIGHT = 10;
const DPI = 300;
const LANDSCAPE_SIZE = {
  width: Math.round((CM_WIDTH / 2.54) * DPI),
  height: Math.round((CM_HEIGHT / 2.54) * DPI)
};
const PORTRAIT_SIZE = {
  width: LANDSCAPE_SIZE.height,
  height: LANDSCAPE_SIZE.width
};

const padPenalty = 50;

function computeGrid(
  count: number,
  canvasWidth: number,
  canvasHeight: number,
  padding: number
) {
  if (count === 0) {
    return { cols: 1, rows: 1, cellW: canvasWidth, cellH: canvasHeight };
  }

  let best = {
    cols: 1,
    rows: count,
    cellW: canvasWidth - padding * 2,
    cellH: (canvasHeight / count || canvasHeight) - padding * 2,
    score: -Infinity
  };

  for (let cols = 1; cols <= count; cols += 1) {
    const rows = Math.ceil(count / cols);
    const cellW = canvasWidth / cols - padding * 2;
    const cellH = canvasHeight / rows - padding * 2;
    if (cellW <= 0 || cellH <= 0) continue;

    const emptyCells = rows * cols - count;
    const score = cellW * cellH - emptyCells * padPenalty;
    if (score > best.score) {
      best = { cols, rows, cellW, cellH, score };
    }
  }

  return best;
}

const buildId = () => Math.random().toString(36).slice(2);

async function loadImages(files: FileList) {
  const list = Array.from(files).filter((file) => file.type.startsWith("image/"));
  const promises = list.map(
    (file) =>
      new Promise<LoadedImage>((resolve, reject) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.decoding = "async";
        img.onload = () =>
          resolve({
            id: `${file.name}-${buildId()}`,
            name: file.name,
            url,
            width: img.naturalWidth,
            height: img.naturalHeight,
            image: img
          });
        img.onerror = () => {
          URL.revokeObjectURL(url);
          reject(new Error("Failed to load image"));
        };
        img.src = url;
      })
  );

  return Promise.all(promises);
}

const formatSize = (width: number, height: number) => `${width}×${height}`;

function App() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const imagesRef = useRef<LoadedImage[]>([]);
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [padding, setPadding] = useState(18);
  const [paddingColor, setPaddingColor] = useState("#f4edde");
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "landscape"
  );
  const [hovering, setHovering] = useState(false);

  const size = orientation === "landscape" ? LANDSCAPE_SIZE : PORTRAIT_SIZE;

  const grid = useMemo(
    () => computeGrid(images.length, size.width, size.height, padding),
    [images.length, padding, size.height, size.width]
  );

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(
    () => () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
    },
    []
  );

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const ratio = window.devicePixelRatio || 1;
    canvas.width = size.width * ratio;
    canvas.height = size.height * ratio;
    canvas.style.width = "100%";
    canvas.style.height = "auto";

    ctx.setTransform(ratio, 0, 0, ratio, 0, 0);
    ctx.clearRect(0, 0, size.width, size.height);
    ctx.fillStyle = paddingColor;
    ctx.fillRect(0, 0, size.width, size.height);

    images.forEach((img, index) => {
      const col = index % grid.cols;
      const row = Math.floor(index / grid.cols);
      const outerW = size.width / grid.cols;
      const outerH = size.height / grid.rows;
      const innerW = outerW - padding * 2;
      const innerH = outerH - padding * 2;
      const scale = Math.min(innerW / img.width, innerH / img.height);
      const drawW = img.width * scale;
      const drawH = img.height * scale;
      const x = col * outerW + padding + (innerW - drawW) / 2;
      const y = row * outerH + padding + (innerH - drawH) / 2;

      ctx.fillStyle = paddingColor;
      ctx.fillRect(col * outerW, row * outerH, outerW, outerH);
      ctx.drawImage(img.image, x, y, drawW, drawH);
    });

    ctx.strokeStyle = "rgba(20, 20, 20, 0.08)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, size.width - 2, size.height - 2);
  }, [grid.cols, grid.rows, images, padding, paddingColor, size.height, size.width]);

  const handleFiles = async (files: FileList | null) => {
    if (!files?.length) return;
    const loaded = await loadImages(files);
    setImages((prev) => [...prev, ...loaded]);
  };

  const onDrop = async (event: React.DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setHovering(false);
    await handleFiles(event.dataTransfer.files);
  };

  const onDownload = () => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    canvas.toBlob((blob) => {
      if (!blob) return;
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `layout-${orientation}-${images.length || "empty"}.png`;
      link.click();
      URL.revokeObjectURL(url);
    });
  };

  const removeImage = (id: string) => {
    setImages((prev) => {
      const target = prev.find((img) => img.id === id);
      if (target) URL.revokeObjectURL(target.url);
      return prev.filter((img) => img.id !== id);
    });
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.url));
    setImages([]);
  };

  const paddingInMm = (padding / DPI) * 25.4;
  const capacity = grid.cols * grid.rows;

  return (
    <div className="shell">
      <header className="hero">
        <div>
          <p className="eyebrow">Tiny-glade like controls · 10×15 cm</p>
          <h1>
            Pack every photo onto a single 10×15 sheet,
            <span className="accent"> automatically</span>.
          </h1>
          <p className="lede">
            Drop images, slide the padding color, and download a print-ready sheet.
            The layout engine squeezes as many shots as possible while keeping aspect
            ratios honest.
          </p>
          <div className="actions">
            <button
              className={`pill ${orientation === "landscape" ? "active" : ""}`}
              onClick={() => setOrientation("landscape")}
            >
              Landscape
              <span className="pill-sub">
                {formatSize(LANDSCAPE_SIZE.width, LANDSCAPE_SIZE.height)} px
              </span>
            </button>
            <button
              className={`pill ${orientation === "portrait" ? "active" : ""}`}
              onClick={() => setOrientation("portrait")}
            >
              Portrait
              <span className="pill-sub">
                {formatSize(PORTRAIT_SIZE.width, PORTRAIT_SIZE.height)} px
              </span>
            </button>
            <button className="ghost" onClick={clearAll}>Clear all</button>
          </div>
        </div>
        <div className="stat-card">
          <div className="stat">
            <span>Placed</span>
            <strong>
              {images.length}/{capacity}
            </strong>
          </div>
          <div className="stat">
            <span>Padding</span>
            <strong>{padding.toFixed(0)} px</strong>
            <small>{paddingInMm.toFixed(1)} mm</small>
          </div>
          <div className="stat">
            <span>Target size</span>
            <strong>{orientation === "landscape" ? "10 × 15" : "15 × 10"} cm</strong>
            <small>@ {DPI} dpi</small>
          </div>
        </div>
      </header>

      <main className="layout">
        <section className="panel upload">
          <label
            className={`dropzone ${hovering ? "hover" : ""}`}
            onDragOver={(e) => {
              e.preventDefault();
              setHovering(true);
            }}
            onDragLeave={() => setHovering(false)}
            onDrop={onDrop}
          >
            <input
              type="file"
              accept="image/*"
              multiple
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="drop-content">
              <span className="badge">Upload</span>
              <p className="drop-title">Drop your photos</p>
              <p className="drop-copy">
                As many as you like. We will pack them into the 10×15 cm canvas.
              </p>
              <p className="tiny">PNG · JPG · HEIC</p>
            </div>
          </label>

          <div className="control">
            <div className="control-header">
              <div>
                <p className="label">Padding thickness</p>
                <p className="hint">Use the slider to expose more of your chosen color.</p>
              </div>
              <strong>{padding.toFixed(0)} px</strong>
            </div>
            <input
              type="range"
              min={0}
              max={64}
              value={padding}
              onChange={(e) => setPadding(Number(e.target.value))}
            />
            <div className="color-row">
              <div>
                <p className="label">Padding color</p>
                <p className="hint">Gives the frame its vibe, Tiny-Glade style.</p>
              </div>
              <div className="color-input">
                <input
                  type="color"
                  value={paddingColor}
                  onChange={(e) => setPaddingColor(e.target.value)}
                />
                <span>{paddingColor.toUpperCase()}</span>
              </div>
            </div>
          </div>

          {images.length > 0 && (
            <div className="list">
              {images.map((img) => (
                <div className="list-item" key={img.id}>
                  <div className="thumb" style={{ backgroundImage: `url(${img.url})` }} />
                  <div>
                    <p className="name">{img.name}</p>
                    <p className="meta">
                      {img.width} × {img.height}
                    </p>
                  </div>
                  <button className="ghost" onClick={() => removeImage(img.id)}>
                    Remove
                  </button>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="panel canvas-panel">
          <div className="canvas-header">
            <div>
              <p className="label">Layout preview</p>
              <p className="hint">
                Auto-tiling keeps aspect ratios. The dotted border is the 10×15 cm edge.
              </p>
            </div>
            <button className="primary" onClick={onDownload} disabled={!canvasRef.current}>
              Download PNG
            </button>
          </div>
          <div className="canvas-frame">
            <div className="cm-label">10×15 cm</div>
            <canvas ref={canvasRef} aria-label="Layout preview"></canvas>
            <div className="grid-note">
              {images.length === 0
                ? "Add photos to see the auto layout."
                : `Grid: ${grid.cols} × ${grid.rows} (${capacity} slots)`}
            </div>
          </div>
        </section>
      </main>
    </div>
  );
}

export default App;

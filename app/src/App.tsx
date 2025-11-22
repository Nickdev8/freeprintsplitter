import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";

type LoadedImage = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  image: HTMLImageElement;
  sizeLabel: string;
};

type Slot = {
  id: string;
  image?: LoadedImage;
  rotationDeg: number;
  offsetX: number;
  offsetY: number;
};

type Card = {
  id: string;
  paddingColor: string;
  orientation: "landscape" | "portrait";
  slots: Slot[];
};

const CM_WIDTH = 15;
const CM_HEIGHT = 10;
const DPI = 300;
const SLOT_COUNT = 4;
const SLOTS_PER_ROW = 2;
const CARD_RADIUS = 0;
const MAX_CARD_SCALE = 4;
const DEFAULT_PADDING = 18;
const DEFAULT_PADDING_COLOR = "#f4edde";
const DEFAULT_ROUNDING = 12;

const colorPresets = [
  { label: "Soft cream", value: "#f4edde" },
  { label: "Stone gray", value: "#eceff3" },
  { label: "Fog blue", value: "#dbe7ff" },
  { label: "Mint", value: "#e3f5e2" },
  { label: "Blush", value: "#ffe6ec" },
  { label: "Charcoal", value: "#1f1f2a" }
];

const buildId = () => Math.random().toString(36).slice(2);

const LANDSCAPE_SIZE = {
  width: Math.round((CM_WIDTH / 2.54) * DPI),
  height: Math.round((CM_HEIGHT / 2.54) * DPI)
};
const PORTRAIT_SIZE = {
  width: LANDSCAPE_SIZE.height,
  height: LANDSCAPE_SIZE.width
};

const getSizeForOrientation = (orientation: "landscape" | "portrait") =>
  orientation === "landscape" ? LANDSCAPE_SIZE : PORTRAIT_SIZE;

const clamp = (val: number, min: number, max: number) => Math.min(max, Math.max(min, val));

function getCardScale(card: Card, padding: number) {
  const baseSize = getSizeForOrientation(card.orientation);
  const metrics = getSlotMetrics(0, baseSize, padding);
  const innerW = metrics.innerW;
  const innerH = metrics.innerH;
  let maxW = 0;
  let maxH = 0;
  card.slots.forEach((slot) => {
    if (slot.image) {
      maxW = Math.max(maxW, slot.image.width);
      maxH = Math.max(maxH, slot.image.height);
    }
  });
  if (maxW === 0 || maxH === 0) return 1;
  const scaleNeeded = Math.max(maxW / innerW, maxH / innerH);
  return clamp(scaleNeeded, 1, MAX_CARD_SCALE);
}

function getScaledCardSize(card: Card, padding: number) {
  const base = getSizeForOrientation(card.orientation);
  const scale = getCardScale(card, padding);
  return {
    width: Math.round(base.width * scale),
    height: Math.round(base.height * scale),
    scale
  };
}

function averageColorFromCard(card: Card): string | null {
  const imgs = card.slots.map((s) => s.image).filter(Boolean) as LoadedImage[];
  if (imgs.length === 0) return null;
  const canvas = document.createElement("canvas");
  canvas.width = 10;
  canvas.height = 10;
  const ctx = canvas.getContext("2d");
  if (!ctx) return null;

  let r = 0;
  let g = 0;
  let b = 0;
  let count = 0;

  imgs.forEach((img) => {
    ctx.clearRect(0, 0, 10, 10);
    ctx.drawImage(img.image, 0, 0, 10, 10);
    const data = ctx.getImageData(0, 0, 10, 10).data;
    for (let i = 0; i < data.length; i += 4) {
      r += data[i];
      g += data[i + 1];
      b += data[i + 2];
      count += 1;
    }
  });

  if (count === 0) return null;
  const toHex = (v: number) => Math.round(v / count).toString(16).padStart(2, "0");
  return `#${toHex(r)}${toHex(g)}${toHex(b)}`;
}

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
            image: img,
            sizeLabel: `${img.naturalWidth}×${img.naturalHeight}`
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

type SlotMetrics = {
  x: number;
  y: number;
  outerW: number;
  outerH: number;
  innerW: number;
  innerH: number;
  centerX: number;
  centerY: number;
  pad: number;
};

function getSlotMetrics(index: number, size: { width: number; height: number }, padding: number) {
  const cols = SLOTS_PER_ROW;
  const rows = SLOT_COUNT / cols;
  const outerW = size.width / cols;
  const outerH = size.height / rows;
  const col = index % cols;
  const row = Math.floor(index / cols);
  const x = col * outerW;
  const y = row * outerH;
  const pad = Math.max(0, Math.min(padding, Math.min(outerW, outerH) / 2 - 1));
  const innerW = Math.max(outerW - pad * 2, 1);
  const innerH = Math.max(outerH - pad * 2, 1);
  const centerX = x + pad + innerW / 2;
  const centerY = y + pad + innerH / 2;
  return { x, y, outerW, outerH, innerW, innerH, centerX, centerY, pad };
}

function getImagePlacement(slot: Slot, metrics: ReturnType<typeof getSlotMetrics>) {
  if (!slot.image) return null;
  const baseScale = Math.max(metrics.innerW / slot.image.width, metrics.innerH / slot.image.height);
  const drawW = slot.image.width * baseScale;
  const drawH = slot.image.height * baseScale;
  const maxOffsetX = Math.max(0, (drawW - metrics.innerW) / 2);
  const maxOffsetY = Math.max(0, (drawH - metrics.innerH) / 2);
  const clampedX = clamp(slot.offsetX ?? 0, -maxOffsetX, maxOffsetX);
  const clampedY = clamp(slot.offsetY ?? 0, -maxOffsetY, maxOffsetY);
  const innerLeft = metrics.innerW / 2 + clampedX - drawW / 2;
  const innerTop = metrics.innerH / 2 + clampedY - drawH / 2;
  return {
    drawW,
    drawH,
    offsetX: clampedX,
    offsetY: clampedY,
    innerLeft,
    innerTop,
    maxOffsetX,
    maxOffsetY
  };
}

function createEmptyCard(): Card {
  return {
    id: `card-${buildId()}`,
    paddingColor: DEFAULT_PADDING_COLOR,
    orientation: "landscape",
    slots: Array.from({ length: SLOT_COUNT }, () => ({
      id: `slot-${buildId()}`,
      rotationDeg: 0,
      offsetX: 0,
      offsetY: 0
    }))
  };
}

const roundRect = (ctx: CanvasRenderingContext2D, x: number, y: number, w: number, h: number, r: number) => {
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.lineTo(x + w - radius, y);
  ctx.quadraticCurveTo(x + w, y, x + w, y + radius);
  ctx.lineTo(x + w, y + h - radius);
  ctx.quadraticCurveTo(x + w, y + h, x + w - radius, y + h);
  ctx.lineTo(x + radius, y + h);
  ctx.quadraticCurveTo(x, y + h, x, y + h - radius);
  ctx.lineTo(x, y + radius);
  ctx.quadraticCurveTo(x, y, x + radius, y);
  ctx.closePath();
};

async function canvasToBlob(canvas: HTMLCanvasElement): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve));
}

function App() {
  const imagesRef = useRef<LoadedImage[]>([]);
  const [images, setImages] = useState<LoadedImage[]>([]);
  const [cards, setCards] = useState<Card[]>([createEmptyCard()]);
  const [padding, setPadding] = useState(DEFAULT_PADDING);
  const [rounding, setRounding] = useState(DEFAULT_ROUNDING);
  const [hovering, setHovering] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
  const [isFilling, setIsFilling] = useState(false);
  const imageUsage = useMemo(() => {
    const map = new Map<string, { cardId: string; slotId: string }>();
    cards.forEach((card) =>
      card.slots.forEach((slot) => {
        if (slot.image && !map.has(slot.image.id)) {
          map.set(slot.image.id, { cardId: card.id, slotId: slot.id });
        }
      })
    );
    return map;
  }, [cards]);

  useEffect(() => {
    imagesRef.current = images;
  }, [images]);

  useEffect(
    () => () => {
      imagesRef.current.forEach((img) => URL.revokeObjectURL(img.url));
    },
    []
  );

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

  const placeImage = (cardId: string, slotId: string, imageId: string) => {
    const img = images.find((i) => i.id === imageId);
    if (!img) return;
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              slots: card.slots.map((slot) =>
                slot.id === slotId
                  ? { ...slot, image: img, rotationDeg: 0, offsetX: 0, offsetY: 0 }
                  : slot
              )
            }
          : card
      )
    );
  };

  const removeImageFromCards = (imageId: string) => {
    setCards((prev) =>
      prev.map((card) => ({
        ...card,
        slots: card.slots.map((slot) =>
          slot.image?.id === imageId ? { ...slot, image: undefined, rotationDeg: 0 } : slot
        )
      }))
    );
    if (selectedImageId === imageId) setSelectedImageId(null);
  };

  const updateSlot = (cardId: string, slotId: string, patch: Partial<Slot>) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? { ...card, slots: card.slots.map((slot) => (slot.id === slotId ? { ...slot, ...patch } : slot)) }
          : card
      )
    );
  };

  const clearSlot = (cardId: string, slotId: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              slots: card.slots.map((slot) =>
                slot.id === slotId ? { ...slot, image: undefined, rotationDeg: 0, offsetX: 0, offsetY: 0 } : slot
              )
            }
          : card
      )
    );
  };

  const autoFill = () => {
    if (isFilling) return;
    const used = new Set(imageUsage.keys());
    const queue = images.filter((img) => !used.has(img.id));
    if (queue.length === 0) return;
    setIsFilling(true);

    setCards((prev) => {
      const nextCards = prev.map((card) => ({
        ...card,
        slots: card.slots.map((slot) => ({ ...slot }))
      }));

      let idx = 0;
      // Fill existing empty slots first.
      for (const card of nextCards) {
        for (const slot of card.slots) {
          if (idx >= queue.length) break;
          if (!slot.image) {
            const img = queue[idx++];
            slot.image = img;
            slot.rotationDeg = 0;
            slot.offsetX = 0;
            slot.offsetY = 0;
          }
        }
      }

      // Add new cards if images remain.
      while (idx < queue.length) {
        const newCard = createEmptyCard();
        for (let s = 0; s < newCard.slots.length && idx < queue.length; s += 1) {
          const img = queue[idx++];
          newCard.slots[s].image = img;
          newCard.slots[s].rotationDeg = 0;
          newCard.slots[s].offsetX = 0;
          newCard.slots[s].offsetY = 0;
        }
        nextCards.push(newCard);
      }
      return nextCards;
    });

    setTimeout(() => setIsFilling(false), 0);
  };

  const paddingInMm = (padding / DPI) * 25.4;
  const resetStyling = () => {
    setPadding(DEFAULT_PADDING);
    setRounding(DEFAULT_ROUNDING);
  };

  const setCardColor = (cardId: string, value: string) => {
    setCards((prev) =>
      prev.map((card) => (card.id === cardId ? { ...card, paddingColor: value } : card))
    );
  };

  const setCardOrientation = (cardId: string, orientation: "landscape" | "portrait") => {
    setCards((prev) =>
      prev.map((card) => (card.id === cardId ? { ...card, orientation } : card))
    );
  };

  const galleryRef = useRef<HTMLDivElement | null>(null);
  const scrollToGallery = () => {
    galleryRef.current?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  const renderCardToBlob = async (card: Card): Promise<Blob | null> => {
    const cardSize = getScaledCardSize(card, padding);
    const scaledPadding = padding * cardSize.scale;
    const canvas = document.createElement("canvas");
    canvas.width = cardSize.width;
    canvas.height = cardSize.height;
    const ctx = canvas.getContext("2d");
    if (!ctx) return null;

    ctx.fillStyle = card.paddingColor;
    ctx.fillRect(0, 0, cardSize.width, cardSize.height);

    card.slots.forEach((slot, slotIndex) => {
      if (!slot.image) return;
      const metrics = getSlotMetrics(slotIndex, cardSize, scaledPadding);
      const placement = getImagePlacement(slot, metrics);
      if (!placement) return;
      const centerX = metrics.x + metrics.pad + placement.innerLeft + placement.drawW / 2;
      const centerY = metrics.y + metrics.pad + placement.innerTop + placement.drawH / 2;

      ctx.save();
      roundRect(ctx, metrics.x + metrics.pad, metrics.y + metrics.pad, metrics.innerW, metrics.innerH, rounding);
      ctx.clip();
      const angle = ((slot.rotationDeg || 0) * Math.PI) / 180;
      ctx.translate(centerX, centerY);
      ctx.rotate(angle);
      ctx.drawImage(slot.image.image, -placement.drawW / 2, -placement.drawH / 2, placement.drawW, placement.drawH);
      ctx.restore();
    });

    ctx.strokeStyle = "rgba(20, 20, 20, 0.08)";
    ctx.lineWidth = 2;
    ctx.strokeRect(1, 1, cardSize.width - 2, cardSize.height - 2);
    return canvasToBlob(canvas);
  };

  const downloadZip = async () => {
    const zip = new JSZip();
    const blobs = await Promise.all(
      cards.map((card, idx) =>
        renderCardToBlob(card).then((blob) => ({ blob, idx, orientation: card.orientation }))
      )
    );

    blobs.forEach(({ blob, idx, orientation }) => {
      if (blob) {
        zip.file(`card-${idx + 1}-${orientation}.png`, blob);
      }
    });

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cards.zip";
    link.click();
    URL.revokeObjectURL(url);
  };

  const downloadSingle = async (card: Card, index: number) => {
    const blob = await renderCardToBlob(card);
    if (!blob) return;
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = `card-${index + 1}-${card.orientation}.png`;
    link.click();
    URL.revokeObjectURL(url);
  };

  const controlBlock = [
    {
      label: "Padding",
      value: padding,
      description: `${padding.toFixed(0)} px · ${paddingInMm.toFixed(1)} mm`,
      min: 0,
      max: 80,
      onChange: (v: number) => setPadding(v)
    },
    {
      label: "Image rounding",
      value: rounding,
      description: `${rounding.toFixed(0)} px`,
      min: 0,
      max: 120,
      onChange: (v: number) => setRounding(v)
    },
  ];

  return (
    <div className="max-w-screen-xl mx-auto px-4 md:px-8 py-10 space-y-8 text-ink">
      <header className="grid lg:grid-cols-[1.4fr,1fr] gap-6 items-center">
        <div className="space-y-3">
          <p className="uppercase tracking-[0.08em] text-sm text-slate-600">
            Tiny-glade like controls · 10×15 cm
          </p>
          <h1 className="text-3xl sm:text-4xl lg:text-5xl font-display leading-tight">
            Drag photos into four slots per card,
            <span className="inline-flex items-center px-2.5 py-1 rounded-full bg-gradient-to-r from-amber-200 to-sky-200 ml-2">
              then sculpt.
            </span>
          </h1>
          <p className="text-slate-700 max-w-2xl">
            Pick images on the left, drop or tap them into the card slots, then drag and scale inside
            the masked area. Defaults are tuned for 4:3 photos; add more cards as you fill four slots.
          </p>
        </div>
        <div className="grid grid-cols-3 gap-3 glass rounded-2xl p-4">
          <Stat label="Library" primary={`${images.length}`} secondary={`${cards.length} card(s)`} />
          <Stat
            label="Padding"
            primary={`${padding.toFixed(0)} px`}
            secondary={`${paddingInMm.toFixed(1)} mm`}
          />
          <Stat label="Per card" primary="4 slots" secondary="2 × 2 grid" />
        </div>
      </header>

      <main className="grid lg:grid-cols-[1.1fr,1.4fr] gap-6 items-start">
        <section className="space-y-4">
          <label
            className={`glass rounded-2xl p-5 border-2 border-dashed ${
              hovering ? "border-sky-300 bg-white" : "border-black/10"
            } cursor-pointer block transition`}
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
              className="hidden"
              onChange={(e) => handleFiles(e.target.files)}
            />
            <div className="text-center space-y-2">
              <span className="inline-flex px-3 py-1 rounded-full bg-slate-100 text-xs font-semibold text-slate-700">
                Upload
              </span>
              <p className="text-xl font-semibold">Drop your photos</p>
              <p className="text-slate-600 text-sm">
                Drag into slots or tap-select then tap a slot. PNG · JPG · HEIC.
              </p>
            </div>
          </label>

          <div className="glass rounded-2xl p-5 space-y-4">
            <p className="font-semibold">Card styling</p>
            <div className="grid gap-4">
              <SliderRow
                label="Padding"
                description={`${padding.toFixed(0)} px · ${paddingInMm.toFixed(1)} mm`}
                value={padding}
                min={0}
                max={80}
                showInput
                onChange={(v) => setPadding(v)}
                onReset={padding !== DEFAULT_PADDING ? () => setPadding(DEFAULT_PADDING) : undefined}
              />
              <SliderRow
                label="Image rounding"
                description={`${rounding.toFixed(0)} px`}
                value={rounding}
                min={0}
                max={120}
                onChange={(v) => setRounding(v)}
                onReset={rounding !== DEFAULT_ROUNDING ? () => setRounding(DEFAULT_ROUNDING) : undefined}
              />
            </div>
          </div>

          {images.length > 0 && (
            <div className="glass rounded-2xl p-5 space-y-3">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-semibold">Library</p>
                  <p className="text-xs text-slate-600">
                    Drag or tap to assign to a slot. Tap again to deselect. Used photos show a check; hover to remove.
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <button
                    className="px-3 py-1.5 text-xs rounded-lg border border-black/10 bg-white disabled:opacity-50"
                    onClick={autoFill}
                    disabled={isFilling}
                  >
                    {isFilling ? "Auto-filling…" : "Auto-fill empties"}
                  </button>
                  <span className="text-xs text-slate-500">{images.length} items</span>
                </div>
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-3 gap-4">
                {images.map((img) => {
                  const used = imageUsage.has(img.id);
                  return (
                    <button
                      key={img.id}
                      className={`relative group border border-black/5 rounded-2xl overflow-hidden text-left bg-white/95 shadow-sm hover:shadow-md hover:-translate-y-0.5 transition ${
                        selectedImageId === img.id ? "ring-2 ring-sky-200" : ""
                      }`}
                      draggable
                      onDragStart={(e) => e.dataTransfer.setData("text/image-id", img.id)}
                      onClick={() => setSelectedImageId((prev) => (prev === img.id ? null : img.id))}
                    >
                      <div className="relative w-full bg-slate-100">
                        <img
                          src={img.url}
                          alt={img.name}
                          className="w-full h-56 sm:h-64 object-cover"
                          draggable={false}
                        />
                        <div className="absolute inset-0 pointer-events-none bg-gradient-to-t from-black/40 via-transparent to-transparent opacity-80" />
                        <div className="absolute top-2 left-2 inline-flex items-center gap-1 px-2 py-1 rounded-full bg-white/90 text-xs font-semibold border border-black/10">
                          {used ? "Used" : "Unused"}
                          {used && <span className="text-emerald-600">✔</span>}
                        </div>
                        <div className="absolute bottom-2 left-2 right-2 text-white drop-shadow">
                          <p className="text-sm font-semibold truncate">{img.name}</p>
                          <p className="text-[11px] font-mono opacity-90">{img.sizeLabel}</p>
                        </div>
                      </div>
                    </button>
                  );
                })}
                <label className="flex flex-col items-center justify-center border border-dashed border-slate-300 rounded-2xl p-6 text-slate-600 bg-white/80 hover:bg-white transition cursor-pointer min-h-[200px]">
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(e) => handleFiles(e.target.files)}
                  />
                  <span className="text-3xl">＋</span>
                  <span className="text-sm mt-1 font-semibold">Upload more</span>
                </label>
              </div>
            </div>
          )}
        </section>

        <section className="space-y-4">
          <div className="glass rounded-2xl p-5 flex flex-col gap-3">
            <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
              <div>
                <p className="font-semibold">Card slots</p>
                <p className="text-xs text-slate-600">
                  Drop images or tap-select to fill slots. Drag inside to pan; adjust size per slot. Fit is cover-biased for 4:3 photos.
                </p>
              </div>
              <div className="flex gap-2">
                <button
                  className="px-4 py-2 rounded-xl bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-lg disabled:opacity-60"
                  onClick={() => {
                    scrollToGallery();
                    downloadZip();
                  }}
                  disabled={cards.length === 0}
                >
                  Download ZIP
                </button>
              </div>
            </div>
          <CardStack
            padding={padding}
            rounding={rounding}
            cards={cards}
            selectedImageId={selectedImageId}
            selectedImage={images.find((img) => img.id === selectedImageId) || null}
            onPlaceImage={placeImage}
            onSlotSelectImage={(imageId) => setSelectedImageId(imageId)}
            onSlotChange={updateSlot}
            onSlotClear={clearSlot}
            onRemoveCard={(id) =>
              setCards((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev))
            }
            onAddCard={() => setCards((prev) => [...prev, createEmptyCard()])}
            onCardColorChange={setCardColor}
            onCardOrientationChange={setCardOrientation}
            totalCards={cards.length}
          />
          </div>
        </section>
      </main>

      <section ref={galleryRef} className="space-y-3">
        <div className="flex items-center justify-between">
          <div>
            <p className="font-semibold">Card preview grid</p>
            <p className="text-xs text-slate-600">
              Quick-look thumbnails with per-card download, or grab all as ZIP.
            </p>
          </div>
          <button
            className="px-3 py-2 text-xs rounded-xl bg-gradient-to-r from-slate-900 to-slate-700 text-white shadow-lg disabled:opacity-60"
            onClick={downloadZip}
            disabled={cards.length === 0}
          >
            Download all (ZIP)
          </button>
        </div>
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-3">
          {cards.map((card, index) => {
            const cardSize = getScaledCardSize(card, padding);
            return (
              <div
                key={`gallery-${card.id}`}
                className="rounded-xl border border-black/5 bg-white/80 p-3 shadow-sm flex flex-col gap-2"
              >
                <div className="flex items-center justify-between text-xs text-slate-600">
                  <span className="font-semibold">Card {index + 1}</span>
                  <span>
                    {card.orientation === "landscape" ? "10×15" : "15×10"} · {cardSize.width}×
                    {cardSize.height}px
                  </span>
                </div>
                <div className="w-full aspect-[3/2] rounded-lg overflow-hidden border border-black/10 bg-white">
                  <CardThumbnail card={card} padding={padding} rounding={rounding} />
                </div>
                <button
                  className="px-3 py-2 text-xs rounded-lg border border-black/10 bg-white hover:-translate-y-0.5 transition"
                  onClick={() => downloadSingle(card, index)}
                >
                  Download card
                </button>
              </div>
            );
          })}
        </div>
      </section>
    </div>
  );
}

type SliderRowProps = {
  label: string;
  description: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  onReset?: () => void;
  showInput?: boolean;
};

function SliderRow({ label, description, value, min, max, step = 1, onChange, onReset, showInput }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-slate-600">{description}</p>
      </div>
      {onReset && (
        <button
          className="px-2 py-1 text-xs rounded-lg border border-black/10 bg-white"
          onClick={onReset}
          title="Reset to default"
        >
          ⟲
        </button>
      )}
      {showInput && (
        <input
          type="number"
          min={min}
          max={max}
          step={step}
          value={value}
          onChange={(e) => onChange(Number(e.target.value))}
          className="w-20 rounded-lg border border-black/10 px-2 py-1 text-sm"
        />
      )}
      <input
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-40 accent-slate-800"
      />
    </div>
  );
}

type StatProps = { label: string; primary: string; secondary?: string };
function Stat({ label, primary, secondary }: StatProps) {
  return (
    <div className="rounded-xl bg-white/70 px-3 py-2 border border-black/5">
      <p className="text-xs uppercase tracking-[0.08em] text-slate-600">{label}</p>
      <p className="text-lg font-semibold">{primary}</p>
      {secondary && <p className="text-xs text-slate-600">{secondary}</p>}
    </div>
  );
}

type CardStackProps = {
  cards: Card[];
  padding: number;
  rounding: number;
  selectedImageId: string | null;
  selectedImage: LoadedImage | null;
  onPlaceImage: (cardId: string, slotId: string, imageId: string) => void;
  onSlotSelectImage: (imageId: string | null) => void;
  onSlotChange: (cardId: string, slotId: string, patch: Partial<Slot>) => void;
  onSlotClear: (cardId: string, slotId: string) => void;
  onRemoveCard: (cardId: string) => void;
  onAddCard: () => void;
  onCardColorChange: (cardId: string, value: string) => void;
  onCardOrientationChange: (cardId: string, orientation: "landscape" | "portrait") => void;
  totalCards: number;
};

function CardStack({
  cards,
  padding,
  rounding,
  selectedImageId,
  selectedImage,
  onPlaceImage,
  onSlotSelectImage,
  onSlotChange,
  onSlotClear,
  onRemoveCard,
  onAddCard,
  onCardColorChange,
  onCardOrientationChange,
  totalCards
}: CardStackProps) {
  return (
    <div className="flex flex-col gap-5">
      {cards.length === 0 && (
        <div className="text-sm text-slate-600">Add photos to see the card layout.</div>
      )}
      {cards.map((card, index) => (
        <CardEditor
          key={card.id}
          card={card}
          index={index}
          totalCards={totalCards}
          padding={padding}
          rounding={rounding}
          selectedImageId={selectedImageId}
          selectedImage={selectedImage}
          onPlaceImage={onPlaceImage}
          onSlotSelectImage={onSlotSelectImage}
          onSlotChange={onSlotChange}
          onSlotClear={onSlotClear}
          onRemoveCard={onRemoveCard}
          onCardColorChange={onCardColorChange}
          onCardOrientationChange={onCardOrientationChange}
        />
      ))}
      <AddCardButton onAdd={onAddCard} size={LANDSCAPE_SIZE} rounding={rounding} paddingColor={DEFAULT_PADDING_COLOR} />
    </div>
  );
}

type CardEditorProps = {
  card: Card;
  index: number;
  totalCards: number;
  padding: number;
  rounding: number;
  selectedImageId: string | null;
  selectedImage: LoadedImage | null;
  onPlaceImage: (cardId: string, slotId: string, imageId: string) => void;
  onSlotSelectImage: (imageId: string | null) => void;
  onSlotChange: (cardId: string, slotId: string, patch: Partial<Slot>) => void;
  onSlotClear: (cardId: string, slotId: string) => void;
  onRemoveCard: (cardId: string) => void;
  onCardColorChange: (cardId: string, value: string) => void;
  onCardOrientationChange: (cardId: string, orientation: "landscape" | "portrait") => void;
};

function CardEditor({
  card,
  index,
  padding,
  rounding,
  selectedImageId,
  selectedImage,
  onPlaceImage,
  onSlotSelectImage,
  onSlotChange,
  onSlotClear,
  onRemoveCard,
  onCardColorChange,
  onCardOrientationChange,
  totalCards
}: CardEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [bounds, setBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });

  useEffect(() => {
    if (!containerRef.current) return;
    const el = containerRef.current;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (entry) {
        setBounds({
          width: entry.contentRect.width,
          height: entry.contentRect.height
        });
      }
    });
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  const cardSize = getScaledCardSize(card, padding);
  const scaledPadding = padding * cardSize.scale;
  const scaleX = bounds.width ? bounds.width / cardSize.width : 1;
  const scaleY = bounds.height ? bounds.height / cardSize.height : 1;
  const scale = Math.min(scaleX || 1, scaleY || 1);

  const handleDropOnSlot = (slotId: string, e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/image-id");
    if (id) {
      onPlaceImage(card.id, slotId, id);
    }
  };

  return (
    <div className="rounded-2xl border border-black/5 bg-white/80 p-4 shadow-lg">
      <div className="flex items-center justify-between text-sm text-slate-700 mb-3">
        <span className="font-semibold">Card {index + 1}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs">
            {card.orientation === "landscape" ? "10×15 cm" : "15×10 cm"} · {cardSize.width}×
            {cardSize.height}px
          </span>
          {index > 0 && (
            <button
              className="px-2 py-1 text-xs rounded-lg border border-rose-100 bg-rose-50 text-rose-700"
              onClick={() => onRemoveCard(card.id)}
            >
              Remove
            </button>
          )}
        </div>
      </div>
        <div className="flex flex-wrap items-center gap-2 mb-3 text-xs text-slate-600">
          <span>Card color</span>
          <div className="flex flex-wrap gap-1">
            {colorPresets.map((preset) => (
              <button
              key={preset.value + card.id}
              className={`w-7 h-7 rounded-full border ${
                card.paddingColor.toLowerCase() === preset.value.toLowerCase()
                  ? "border-sky-300 ring-1 ring-sky-200"
                  : "border-black/10"
              }`}
              style={{ backgroundColor: preset.value }}
              onClick={() => onCardColorChange(card.id, preset.value)}
              title={preset.label}
            />
          ))}
        </div>
        <div className="flex items-center gap-2 ml-auto">
          <span className="text-xs text-slate-600">Orientation</span>
          <div className="flex gap-1">
            {(["landscape", "portrait"] as const).map((o) => (
              <button
                key={o}
                className={`px-2 py-1 text-[11px] rounded-lg border ${
                  card.orientation === o ? "border-sky-300 bg-white ring-1 ring-sky-200" : "border-black/10 bg-white/80"
                }`}
                onClick={() => onCardOrientationChange(card.id, o)}
              >
                {o === "landscape" ? "10×15" : "15×10"}
              </button>
            ))}
          </div>
        </div>
        <label className="flex items-center gap-1">
          <input
            type="color"
            value={card.paddingColor}
            onChange={(e) => onCardColorChange(card.id, e.target.value)}
            className="w-8 h-8 rounded-full border border-black/10 bg-white"
            aria-label="Custom card color"
          />
        </label>
        <button
          className="px-2 py-1 text-[11px] rounded-lg border border-black/10 bg-white/90 disabled:opacity-50"
          disabled={!card.slots.some((s) => s.image)}
          onClick={() => {
            const avg = averageColorFromCard(card);
            if (avg) onCardColorChange(card.id, avg);
          }}
        >
          Auto color
        </button>
      </div>
    <div
      className="relative w-full border border-black/5 overflow-hidden"
      ref={containerRef}
      style={{
        aspectRatio: `${cardSize.width} / ${cardSize.height}`,
        borderRadius: `${CARD_RADIUS}px`,
        backgroundColor: card.paddingColor,
        boxShadow: "inset 0 0 0 1px rgba(255,255,255,0.6)"
      }}
    >
      {card.slots.map((slot, slotIndex) => {
        const metrics = getSlotMetrics(slotIndex, cardSize, scaledPadding);
        const left = metrics.x * scale;
        const top = metrics.y * scale;
        const width = metrics.outerW * scale;
        const height = metrics.outerH * scale;
        const padPx = metrics.pad * scale;
        const innerW = metrics.innerW * scale;
        const innerH = metrics.innerH * scale;
        const placement = getImagePlacement(slot, metrics);
        const drawWPx = placement ? placement.drawW * scale : 0;
        const drawHPx = placement ? placement.drawH * scale : 0;
        const drawLeft = placement ? placement.innerLeft * scale : 0;
        const drawTop = placement ? placement.innerTop * scale : 0;
        const rotation = slot.rotationDeg || 0;

          return (
            <div
              key={slot.id}
              className="absolute transition"
              style={{
                left,
                top,
                width,
                height,
                cursor: selectedImageId ? "copy" : "pointer"
              }}
              onClick={() => {
                if (selectedImageId) {
                  onPlaceImage(card.id, slot.id, selectedImageId);
                  onSlotSelectImage(null);
                }
              }}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnSlot(slot.id, e)}
            >
              <div className="relative w-full h-full" style={{ backgroundColor: card.paddingColor }}>
                <div
                  className="absolute"
                  style={{
                    left: padPx,
                    top: padPx,
                    width: innerW,
                    height: innerH,
                    overflow: "hidden",
                    borderRadius: `${rounding}px`,
                    background: slot.image ? "transparent" : "rgba(255,255,255,0.6)"
                  }}
                >
                  {!slot.image && selectedImage && (
                    <div
                      className="absolute inset-0 bg-center bg-cover opacity-30 pointer-events-none transition"
                      style={{ backgroundImage: `url(${selectedImage.url})` }}
                    />
                  )}
                  {slot.image ? (
                    <img
                      src={slot.image.url}
                      alt={slot.image.name}
                      draggable={false}
                      className="absolute cursor-grab active:cursor-grabbing touch-none select-none"
                      style={{
                        width: drawWPx,
                        height: drawHPx,
                        left: drawLeft,
                        top: drawTop,
                        transform: `rotate(${rotation}deg)`,
                        transformOrigin: "center center",
                        borderRadius: `${rounding}px`,
                        objectFit: "cover"
                      }}
                      onPointerDown={(e) => {
                        if (!placement) return;
                        e.preventDefault();
                        e.stopPropagation();
                        (e.target as HTMLElement).setPointerCapture(e.pointerId);
                        const start = {
                          x: e.clientX,
                          y: e.clientY,
                          offsetX: placement.offsetX,
                          offsetY: placement.offsetY
                        };
                        const handleMove = (ev: PointerEvent) => {
                          const dx = (ev.clientX - start.x) / scale;
                          const dy = (ev.clientY - start.y) / scale;
                          const nextX = clamp(
                            start.offsetX + dx,
                            -placement.maxOffsetX,
                            placement.maxOffsetX
                          );
                          const nextY = clamp(
                            start.offsetY + dy,
                            -placement.maxOffsetY,
                            placement.maxOffsetY
                          );
                          onSlotChange(card.id, slot.id, { offsetX: nextX, offsetY: nextY });
                        };
                        const handleUp = (ev: PointerEvent) => {
                          (e.target as HTMLElement).releasePointerCapture(ev.pointerId);
                          window.removeEventListener("pointermove", handleMove);
                          window.removeEventListener("pointerup", handleUp);
                          window.removeEventListener("pointercancel", handleUp);
                        };
                        window.addEventListener("pointermove", handleMove);
                        window.addEventListener("pointerup", handleUp);
                        window.addEventListener("pointercancel", handleUp);
                      }}
                    />
                  ) : (
                    <div className="w-full h-full grid place-items-center text-xs font-semibold text-slate-600">
                      Drop or tap
                    </div>
                  )}
                  {slot.image && (
                    <div className="absolute top-2 right-2 flex gap-1">
                      <button
                        className="px-1.5 py-1 text-[11px] rounded-md bg-white/90 border border-black/10"
                        title="Rotate left"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSlotChange(card.id, slot.id, {
                            rotationDeg: ((rotation - 90) % 360 + 360) % 360
                          });
                        }}
                      >
                        ↺
                      </button>
                      <button
                        className="px-1.5 py-1 text-[11px] rounded-md bg-white/90 border border-black/10"
                        title="Rotate right"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSlotChange(card.id, slot.id, {
                            rotationDeg: (rotation + 90) % 360
                          });
                        }}
                      >
                        ↻
                      </button>
                      <button
                        className="px-1.5 py-1 text-[11px] rounded-md bg-white/90 border border-black/10 text-rose-600"
                        title="Clear"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSlotClear(card.id, slot.id);
                        }}
                      >
                        ×
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

type AddCardButtonProps = {
  onAdd: () => void;
  size: { width: number; height: number };
  paddingColor: string;
  rounding: number;
};

function AddCardButton({ onAdd, size, paddingColor, rounding }: AddCardButtonProps) {
  return (
    <button
      className="w-full border border-dashed border-slate-300 text-slate-600 rounded-2xl bg-white/70 hover:bg-white transition"
      style={{
        aspectRatio: `${size.width} / ${size.height}`,
        borderRadius: `${CARD_RADIUS}px`,
        backgroundColor: paddingColor
      }}
      onClick={onAdd}
    >
      <div className="flex flex-col items-center justify-center h-full gap-2 pointer-events-none">
        <span className="text-lg font-semibold">Add card</span>
        <span className="text-xs text-slate-500">Tap to create another sheet</span>
      </div>
    </button>
  );
}

type CardThumbnailProps = {
  card: Card;
  padding: number;
  rounding: number;
};

function CardThumbnail({ card, padding, rounding }: CardThumbnailProps) {
  const cardSize = getScaledCardSize(card, padding);
  const scaledPadding = padding * cardSize.scale;
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext("2d");
    if (!ctx) return;

    const width = cardSize.width;
    const height = cardSize.height;
    const scale = 150 / width; // scale down to about 150px wide
    const viewW = width * scale;
    const viewH = height * scale;
    canvas.width = viewW;
    canvas.height = viewH;

    ctx.fillStyle = card.paddingColor;
    ctx.fillRect(0, 0, viewW, viewH);

    card.slots.forEach((slot, slotIndex) => {
      if (!slot.image) return;
      const metrics = getSlotMetrics(slotIndex, cardSize, scaledPadding);
      const placement = getImagePlacement(slot, metrics);
      if (!placement) return;
      const innerW = metrics.innerW * scale;
      const innerH = metrics.innerH * scale;
      const drawW = placement.drawW * scale;
      const drawH = placement.drawH * scale;
      const centerX = (metrics.x + metrics.pad + placement.innerLeft + placement.drawW / 2) * scale;
      const centerY = (metrics.y + metrics.pad + placement.innerTop + placement.drawH / 2) * scale;
      const rotation = ((slot.rotationDeg || 0) * Math.PI) / 180;
      ctx.save();
      roundRect(
        ctx,
        metrics.x * scale + metrics.pad * scale,
        metrics.y * scale + metrics.pad * scale,
        innerW,
        innerH,
        rounding
      );
      ctx.clip();
      ctx.translate(centerX, centerY);
      ctx.rotate(rotation);
      ctx.drawImage(slot.image.image, -drawW / 2, -drawH / 2, drawW, drawH);
      ctx.restore();
    });

    ctx.strokeStyle = "rgba(20, 20, 20, 0.08)";
    ctx.lineWidth = 1;
    ctx.strokeRect(0.5, 0.5, viewW - 1, viewH - 1);
  }, [card, cardSize.height, cardSize.width, padding, rounding]);

  return <canvas ref={canvasRef} className="w-full h-auto" aria-hidden />;
}

export default App;

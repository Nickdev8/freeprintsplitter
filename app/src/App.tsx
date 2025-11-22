import JSZip from "jszip";
import { useEffect, useMemo, useRef, useState } from "react";

type LoadedImage = {
  id: string;
  name: string;
  url: string;
  width: number;
  height: number;
  image: HTMLImageElement;
};

type Slot = {
  id: string;
  image?: LoadedImage;
  offsetX: number;
  offsetY: number;
  rotationDeg: number;
};

type Card = {
  id: string;
  slots: Slot[];
};

const CM_WIDTH = 15;
const CM_HEIGHT = 10;
const DPI = 300;
const SLOT_COUNT = 4;
const SLOTS_PER_ROW = 2;

const buildId = () => Math.random().toString(36).slice(2);

const LANDSCAPE_SIZE = {
  width: Math.round((CM_WIDTH / 2.54) * DPI),
  height: Math.round((CM_HEIGHT / 2.54) * DPI)
};
const PORTRAIT_SIZE = {
  width: LANDSCAPE_SIZE.height,
  height: LANDSCAPE_SIZE.width
};

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

type SlotMetrics = {
  x: number;
  y: number;
  outerW: number;
  outerH: number;
  innerW: number;
  innerH: number;
  centerX: number;
  centerY: number;
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
  const innerW = Math.max(outerW - padding * 2, 1);
  const innerH = Math.max(outerH - padding * 2, 1);
  const centerX = x + padding + innerW / 2;
  const centerY = y + padding + innerH / 2;
  return { x, y, outerW, outerH, innerW, innerH, centerX, centerY };
}

function createEmptyCard(): Card {
  return {
    id: `card-${buildId()}`,
    slots: Array.from({ length: SLOT_COUNT }, () => ({
      id: `slot-${buildId()}`,
      offsetX: 0,
      offsetY: 0,
      rotationDeg: 0
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
  const [padding, setPadding] = useState(18);
  const [paddingColor, setPaddingColor] = useState("#f4edde");
  const [rounding, setRounding] = useState(12);
  const [orientation, setOrientation] = useState<"landscape" | "portrait">(
    "landscape"
  );
  const [hovering, setHovering] = useState(false);
  const [selectedImageId, setSelectedImageId] = useState<string | null>(null);
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

  const size = orientation === "landscape" ? LANDSCAPE_SIZE : PORTRAIT_SIZE;

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
    setCards((prev) => {
      const target = prev.find((c) => c.id === cardId);
      const wasFull = target ? target.slots.every((s) => s.image) : false;
      let becameFull = false;

      const next = prev.map((card) => {
        if (card.id !== cardId) return card;
        const slots = card.slots.map((slot) =>
          slot.id === slotId
            ? { ...slot, image: img, offsetX: 0, offsetY: 0, rotationDeg: 0 }
            : slot
        );
        const nowFull = slots.every((s) => s.image);
        if (!wasFull && nowFull) becameFull = true;
        return { ...card, slots };
      });

      if (becameFull) {
        next.push(createEmptyCard());
      }
      return next;
    });
  };

  const removeImageFromCards = (imageId: string) => {
    setCards((prev) =>
      prev.map((card) => ({
        ...card,
        slots: card.slots.map((slot) =>
          slot.image?.id === imageId
            ? { ...slot, image: undefined, offsetX: 0, offsetY: 0, rotationDeg: 0 }
            : slot
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
                slot.id === slotId
                  ? { ...slot, image: undefined, offsetX: 0, offsetY: 0, rotationDeg: 0 }
                  : slot
              )
            }
          : card
      )
    );
  };

  const clearAll = () => {
    images.forEach((img) => URL.revokeObjectURL(img.url));
    setImages([]);
    setCards([createEmptyCard()]);
    setSelectedImageId(null);
  };

  const centerCard = (cardId: string) => {
    setCards((prev) =>
      prev.map((card) =>
        card.id === cardId
          ? {
              ...card,
              slots: card.slots.map((slot) =>
                slot.image ? { ...slot, offsetX: 0, offsetY: 0, rotationDeg: 0 } : slot
              )
            }
          : card
      )
    );
  };

  const autoFill = () => {
    const used = new Set(imageUsage.keys());
    const queue = images.filter((img) => !used.has(img.id));
    if (queue.length === 0) return;

    setCards((prev) => {
      const nextCards = prev.map((card) => ({
        ...card,
        slots: card.slots.map((slot) => ({ ...slot }))
      }));

      const fillSlots = (cardsList: Card[]) => {
        for (const card of cardsList) {
          for (const slot of card.slots) {
            if (queue.length === 0) return;
            if (!slot.image) {
              const img = queue.shift();
              if (!img) return;
              slot.image = img;
              slot.offsetX = 0;
              slot.offsetY = 0;
              slot.rotationDeg = 0;
            }
          }
        }
      };

      fillSlots(nextCards);
      while (queue.length > 0) {
        const newCard = createEmptyCard();
        nextCards.push(newCard);
        fillSlots([newCard]);
      }
      return nextCards;
    });
  };

  const paddingInMm = (padding / DPI) * 25.4;

  const downloadZip = async () => {
    const zip = new JSZip();
    for (let c = 0; c < cards.length; c += 1) {
      const canvas = document.createElement("canvas");
      canvas.width = size.width;
      canvas.height = size.height;
      const ctx = canvas.getContext("2d");
      if (!ctx) continue;

      ctx.fillStyle = paddingColor;
      ctx.fillRect(0, 0, size.width, size.height);

      cards[c].slots.forEach((slot, slotIndex) => {
        if (!slot.image) return;
        const metrics = getSlotMetrics(slotIndex, size, padding);
        // Use cover fit so 4:3-heavy photos fill the slot without letterboxing
        const baseScale = Math.max(
          metrics.innerW / slot.image.width,
          metrics.innerH / slot.image.height
        );
        const drawW = slot.image.width * baseScale;
        const drawH = slot.image.height * baseScale;
        const offsetX = slot.offsetX * (metrics.innerW / 2);
        const offsetY = slot.offsetY * (metrics.innerH / 2);
        const centerX = metrics.centerX + offsetX;
        const centerY = metrics.centerY + offsetY;

        ctx.save();
        roundRect(ctx, metrics.x + padding, metrics.y + padding, metrics.innerW, metrics.innerH, rounding);
        ctx.clip();
        const angle = ((slot.rotationDeg || 0) * Math.PI) / 180;
        ctx.translate(centerX, centerY);
        ctx.rotate(angle);
        ctx.drawImage(slot.image.image, -drawW / 2, -drawH / 2, drawW, drawH);
        ctx.restore();
      });

      ctx.strokeStyle = "rgba(20, 20, 20, 0.08)";
      ctx.lineWidth = 2;
      ctx.strokeRect(1, 1, size.width - 2, size.height - 2);

      const blob = await canvasToBlob(canvas);
      if (blob) {
        zip.file(`card-${c + 1}-${orientation}.png`, blob);
      }
    }

    const content = await zip.generateAsync({ type: "blob" });
    const url = URL.createObjectURL(content);
    const link = document.createElement("a");
    link.href = url;
    link.download = "cards.zip";
    link.click();
    URL.revokeObjectURL(url);
  };

  const controlBlock = [
    {
      label: "Padding",
      value: padding,
      description: `${padding.toFixed(0)} px · ${paddingInMm.toFixed(1)} mm`,
      min: 0,
      max: 64,
      onChange: (v: number) => setPadding(v)
    },
    {
      label: "Corner rounding",
      value: rounding,
      description: `${rounding.toFixed(0)} px`,
      min: 0,
      max: 48,
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
          <div className="flex flex-wrap gap-3">
            <button
              className={`px-4 py-3 rounded-2xl border border-black/5 shadow-sm bg-white/70 hover:-translate-y-0.5 transition ${orientation === "landscape" ? "ring-2 ring-sky-200" : ""}`}
              onClick={() => setOrientation("landscape")}
            >
              <div className="font-semibold">Landscape</div>
              <div className="text-xs text-slate-600">
                {formatSize(LANDSCAPE_SIZE.width, LANDSCAPE_SIZE.height)} px
              </div>
            </button>
            <button
              className={`px-4 py-3 rounded-2xl border border-black/5 shadow-sm bg-white/70 hover:-translate-y-0.5 transition ${orientation === "portrait" ? "ring-2 ring-sky-200" : ""}`}
              onClick={() => setOrientation("portrait")}
            >
              <div className="font-semibold">Portrait</div>
              <div className="text-xs text-slate-600">
                {formatSize(PORTRAIT_SIZE.width, PORTRAIT_SIZE.height)} px
              </div>
            </button>
            <button
              className="px-4 py-3 rounded-2xl border border-black/10 text-slate-800 bg-slate-100 hover:-translate-y-0.5 transition"
              onClick={clearAll}
            >
              Clear all
            </button>
          </div>
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
              {controlBlock.map((ctrl) => (
                <SliderRow
                  key={ctrl.label}
                  label={ctrl.label}
                  description={ctrl.description}
                  value={ctrl.value}
                  min={ctrl.min}
                  max={ctrl.max}
                  step={1}
                  onChange={ctrl.onChange}
                />
              ))}
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="text-sm font-semibold">Padding color</p>
                  <p className="text-xs text-slate-600">Background and slot fill</p>
                </div>
                <div className="flex items-center gap-2">
                  <input
                    type="color"
                    value={paddingColor}
                    onChange={(e) => setPaddingColor(e.target.value)}
                    className="w-12 h-10 rounded-lg border border-black/10 bg-white"
                  />
                  <span className="text-xs font-mono">{paddingColor.toUpperCase()}</span>
                </div>
              </div>
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
                    className="px-3 py-1.5 text-xs rounded-lg border border-black/10 bg-white"
                    onClick={autoFill}
                  >
                    Auto-fill empties
                  </button>
                  <span className="text-xs text-slate-500">{images.length} items</span>
                </div>
              </div>
              <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                {images.map((img) => (
                  <button
                    key={img.id}
                    className={`relative group flex gap-2 items-center border border-black/5 rounded-xl p-2 text-left bg-white/70 hover:-translate-y-0.5 transition ${
                      selectedImageId === img.id ? "ring-2 ring-sky-200" : ""
                    }`}
                    draggable
                    onDragStart={(e) => e.dataTransfer.setData("text/image-id", img.id)}
                    onClick={(e) => {
                      if (imageUsage.has(img.id)) {
                        e.preventDefault();
                        removeImageFromCards(img.id);
                        return;
                      }
                      setSelectedImageId((prev) => (prev === img.id ? null : img.id));
                    }}
                  >
                    <div
                      className="w-12 h-12 rounded-lg bg-cover bg-center border border-black/5"
                      style={{ backgroundImage: `url(${img.url})` }}
                    />
                    <div className="flex-1">
                      <p className="text-sm font-semibold line-clamp-1">{img.name}</p>
                      <p className="text-xs text-slate-600">
                        {img.width} × {img.height}
                      </p>
                    </div>
                    {imageUsage.has(img.id) && (
                      <div className="absolute right-2 top-2">
                        <span className="inline-flex items-center justify-center w-6 h-6 rounded-full bg-emerald-500 text-white text-xs font-bold group-hover:hidden">
                          ✓
                        </span>
                        <span className="hidden group-hover:inline-flex items-center justify-center w-6 h-6 rounded-full bg-rose-500 text-white text-xs font-bold">
                          ×
                        </span>
                      </div>
                    )}
                  </button>
                ))}
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
                  onClick={downloadZip}
                  disabled={cards.length === 0}
                >
                  Download ZIP
                </button>
              </div>
            </div>
          <CardStack
            size={size}
            padding={padding}
            rounding={rounding}
            shadow={shadow}
            paddingColor={paddingColor}
            cards={cards}
            selectedImageId={selectedImageId}
            onPlaceImage={placeImage}
          onSlotSelectImage={(imageId) => setSelectedImageId(imageId)}
          onSlotChange={updateSlot}
          onSlotClear={clearSlot}
          onCenterCard={centerCard}
          onRemoveCard={(id) =>
            setCards((prev) => (prev.length > 1 ? prev.filter((c) => c.id !== id) : prev))
          }
          onAddCard={() => setCards((prev) => [...prev, createEmptyCard()])}
          totalCards={cards.length}
        />
          </div>
        </section>
      </main>
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
};

function SliderRow({ label, description, value, min, max, step = 1, onChange }: SliderRowProps) {
  return (
    <div className="flex items-center gap-3">
      <div className="flex-1">
        <p className="text-sm font-semibold">{label}</p>
        <p className="text-xs text-slate-600">{description}</p>
      </div>
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
  size: { width: number; height: number };
  padding: number;
  rounding: number;
  shadow: number;
  paddingColor: string;
  selectedImageId: string | null;
  onPlaceImage: (cardId: string, slotId: string, imageId: string) => void;
  onSlotSelectImage: (imageId: string | null) => void;
  onSlotChange: (cardId: string, slotId: string, patch: Partial<Slot>) => void;
  onSlotClear: (cardId: string, slotId: string) => void;
  onCenterCard: (cardId: string) => void;
  onRemoveCard: (cardId: string) => void;
  onAddCard: () => void;
  totalCards: number;
};

function CardStack({
  cards,
  size,
  padding,
  rounding,
  shadow,
  paddingColor,
  selectedImageId,
  onPlaceImage,
  onSlotSelectImage,
  onSlotChange,
  onSlotClear,
  onCenterCard,
  onRemoveCard,
  onAddCard,
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
          size={size}
          padding={padding}
          paddingColor={paddingColor}
          rounding={rounding}
          shadow={shadow}
          selectedImageId={selectedImageId}
          onPlaceImage={onPlaceImage}
          onSlotSelectImage={onSlotSelectImage}
          onSlotChange={onSlotChange}
          onSlotClear={onSlotClear}
          onCenterCard={onCenterCard}
          onRemoveCard={onRemoveCard}
        />
      ))}
      <AddCardButton onAdd={onAddCard} size={size} rounding={rounding} shadow={shadow} paddingColor={paddingColor} />
    </div>
  );
}

type CardEditorProps = {
  card: Card;
  index: number;
  totalCards: number;
  size: { width: number; height: number };
  padding: number;
  paddingColor: string;
  rounding: number;
  shadow: number;
  selectedImageId: string | null;
  onPlaceImage: (cardId: string, slotId: string, imageId: string) => void;
  onSlotSelectImage: (imageId: string | null) => void;
  onSlotChange: (cardId: string, slotId: string, patch: Partial<Slot>) => void;
  onSlotClear: (cardId: string, slotId: string) => void;
  onCenterCard: (cardId: string) => void;
  onRemoveCard: (cardId: string) => void;
};

function CardEditor({
  card,
  index,
  size,
  padding,
  paddingColor,
  rounding,
  shadow,
  selectedImageId,
  onPlaceImage,
  onSlotSelectImage,
  onSlotChange,
  onSlotClear,
  onCenterCard,
  onRemoveCard,
  totalCards
}: CardEditorProps) {
  const containerRef = useRef<HTMLDivElement | null>(null);
  const [selectedSlotId, setSelectedSlotId] = useState<string | null>(null);
  const [bounds, setBounds] = useState<{ width: number; height: number }>({ width: 0, height: 0 });
  const dragRef = useRef<{ slotId: string | null; pointerId: number | null }>({
    slotId: null,
    pointerId: null
  });

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

  const scaleX = bounds.width ? bounds.width / size.width : 1;
  const scaleY = bounds.height ? bounds.height / size.height : 1;
  const scale = Math.min(scaleX || 1, scaleY || 1);

  const handleDropOnSlot = (slotId: string, e: React.DragEvent) => {
    e.preventDefault();
    const id = e.dataTransfer.getData("text/image-id");
    if (id) {
      onPlaceImage(card.id, slotId, id);
      setSelectedSlotId(slotId);
    }
  };

  const handleSlotClick = (slotId: string) => {
    if (selectedImageId) {
      onPlaceImage(card.id, slotId, selectedImageId);
      setSelectedSlotId(slotId);
      onSlotSelectImage(null);
      return;
    }
    setSelectedSlotId(slotId);
  };

  const handlePointerDown = (e: React.PointerEvent, slotIndex: number, slotId: string) => {
    if (e.pointerType === "mouse" && e.button !== 0) return;
    dragRef.current = { slotId, pointerId: e.pointerId };
    (e.target as HTMLElement).setPointerCapture(e.pointerId);
  };

  const handlePointerMove = (e: React.PointerEvent, slotIndex: number, slotId: string) => {
    if (dragRef.current.slotId !== slotId) return;
    const metrics = getSlotMetrics(slotIndex, size, padding);
    const rect = containerRef.current?.getBoundingClientRect();
    if (!rect) return;
    const posX = (e.clientX - rect.left) / scale;
    const posY = (e.clientY - rect.top) / scale;
    const offsetX = (posX - metrics.centerX) / (metrics.innerW / 2);
    const offsetY = (posY - metrics.centerY) / (metrics.innerH / 2);
    onSlotChange(card.id, slotId, {
      offsetX: Math.max(Math.min(offsetX, 3), -3),
      offsetY: Math.max(Math.min(offsetY, 3), -3)
    });
  };

  const handlePointerUp = (e: React.PointerEvent) => {
    if (dragRef.current.pointerId !== null) {
      (e.target as HTMLElement).releasePointerCapture(dragRef.current.pointerId);
    }
    dragRef.current = { slotId: null, pointerId: null };
  };

  const selectedSlot = card.slots.find((slot) => slot.id === selectedSlotId);

  return (
    <div className="rounded-2xl border border-black/5 bg-white/80 p-4 shadow-lg">
      <div className="flex items-center justify-between text-sm text-slate-700 mb-3">
        <span className="font-semibold">Card {index + 1}</span>
        <div className="flex items-center gap-2">
          <span className="text-xs">
            10×15 cm · {size.width}×{size.height}px
          </span>
          <button
            className="px-2 py-1 text-xs rounded-lg border border-black/10 bg-white"
            onClick={() => onCenterCard(card.id)}
          >
            Center all
          </button>
          <button
            className="px-2 py-1 text-xs rounded-lg border border-rose-100 bg-rose-50 text-rose-700 disabled:opacity-50"
            disabled={totalCards <= 1}
            onClick={() => onRemoveCard(card.id)}
          >
            Remove
          </button>
        </div>
      </div>
      <div
        className="relative w-full border border-black/5 overflow-hidden"
        ref={containerRef}
        style={{
          aspectRatio: `${size.width} / ${size.height}`,
          borderRadius: `${rounding + 8}px`,
          backgroundColor: paddingColor,
          boxShadow: shadow
            ? `0 ${shadow * 0.4}px ${shadow}px rgba(0,0,0,0.12), inset 0 0 0 1px rgba(255,255,255,0.6)`
            : "inset 0 0 0 1px rgba(255,255,255,0.6)"
        }}
      >
        {card.slots.map((slot, slotIndex) => {
          const metrics = getSlotMetrics(slotIndex, size, padding);
          const left = metrics.x * scale;
          const top = metrics.y * scale;
          const width = metrics.outerW * scale;
          const height = metrics.outerH * scale;
          const padPx = padding * scale;
          const innerW = metrics.innerW * scale;
          const innerH = metrics.innerH * scale;

          const baseScale = slot.image
            ? Math.max(metrics.innerW / slot.image.width, metrics.innerH / slot.image.height)
            : 1;
          const drawW = slot.image ? slot.image.width * baseScale : 0;
          const drawH = slot.image ? slot.image.height * baseScale : 0;
          const drawWPx = drawW * scale;
          const drawHPx = drawH * scale;
          const offsetX = slot.offsetX * (metrics.innerW / 2);
          const offsetY = slot.offsetY * (metrics.innerH / 2);
          const centerXPx = innerW / 2 + offsetX * scale;
          const centerYPx = innerH / 2 + offsetY * scale;
          const drawLeft = centerXPx - drawWPx / 2;
          const drawTop = centerYPx - drawHPx / 2;
          const rotation = slot.rotationDeg || 0;

          return (
            <div
              key={slot.id}
              className={`absolute transition ${selectedSlotId === slot.id ? "ring-2 ring-slate-500/50" : ""}`}
              style={{ left, top, width, height }}
              onClick={() => handleSlotClick(slot.id)}
              onDragOver={(e) => e.preventDefault()}
              onDrop={(e) => handleDropOnSlot(slot.id, e)}
            >
              <div
                className="relative w-full h-full"
                style={{
                  padding: padPx,
                  backgroundColor: paddingColor
                }}
              >
                <div
                  className="absolute inset-0 overflow-hidden"
                  style={{
                    borderRadius: `${rounding}px`,
                    boxShadow: shadow ? `0 ${shadow * 0.35}px ${shadow}px rgba(0,0,0,0.08)` : "none",
                    background: slot.image ? "transparent" : "rgba(255,255,255,0.6)"
                  }}
                >
                  {slot.image ? (
                    <div
                      className="absolute top-0 left-0 bg-cover bg-center"
                      style={{
                        width: drawWPx,
                        height: drawHPx,
                        transform: `translate(${drawLeft}px, ${drawTop}px) rotate(${rotation}deg)`,
                        transformOrigin: "center center",
                        backgroundImage: `url(${slot.image.url})`
                      }}
                      onPointerDown={(e) => handlePointerDown(e, slotIndex, slot.id)}
                      onPointerMove={(e) => handlePointerMove(e, slotIndex, slot.id)}
                      onPointerUp={handlePointerUp}
                      onPointerLeave={handlePointerUp}
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
                        className="px-1.5 py-1 text-[11px] rounded-md bg-white/90 border border-black/10"
                        onClick={(e) => {
                          e.stopPropagation();
                          onSlotChange(card.id, slot.id, { offsetX: 0, offsetY: 0 });
                        }}
                      >
                        Center
                      </button>
                    </div>
                  )}
                </div>
              </div>
            </div>
          );
        })}
      </div>
      <div className="text-xs text-slate-600 mt-2">
        Drag inside a slot to pan. Tap a library item then tap a slot on touch devices.
      </div>
      {selectedSlot && selectedSlot.image && (
        <div className="mt-3 flex flex-col gap-2 rounded-xl border border-black/5 bg-white/80 p-3">
          <div className="flex items-center justify-between gap-2">
            <div>
              <p className="text-sm font-semibold">Slot controls</p>
              <p className="text-xs text-slate-600">Reset/clear</p>
            </div>
            <div className="flex gap-2">
              <button
                className="px-3 py-1.5 text-xs rounded-lg border border-black/10"
                onClick={() => onSlotChange(card.id, selectedSlot.id, { offsetX: 0, offsetY: 0 })}
              >
                Reset
              </button>
              <button
                className="px-3 py-1.5 text-xs rounded-lg border border-black/10"
                onClick={() => onSlotClear(card.id, selectedSlot.id)}
              >
                Clear
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

type AddCardButtonProps = {
  onAdd: () => void;
  size: { width: number; height: number };
  paddingColor: string;
  rounding: number;
  shadow: number;
};

function AddCardButton({ onAdd, size, paddingColor, rounding, shadow }: AddCardButtonProps) {
  return (
    <button
      className="w-full border border-dashed border-slate-300 text-slate-600 rounded-2xl bg-white/70 hover:bg-white transition"
      style={{
        aspectRatio: `${size.width} / ${size.height}`,
        borderRadius: `${rounding + 8}px`,
        boxShadow: shadow
          ? `0 ${shadow * 0.4}px ${shadow}px rgba(0,0,0,0.08), inset 0 0 0 1px rgba(255,255,255,0.6)`
          : "inset 0 0 0 1px rgba(255,255,255,0.6)",
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

export default App;

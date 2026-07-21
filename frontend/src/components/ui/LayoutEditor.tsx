import type { DragEvent, ReactNode } from "react";
import { EllipsisVerticalIcon, RectangleGroupIcon } from "@heroicons/react/24/outline";

export function LayoutEditorToolbar({
  title,
  idleDescription = "Customize order.",
  editingDescription = "Drag into your preferred order.",
  doneLabel = "Done",
  isEditing,
  onToggleEdit,
  onReset,
  className = "",
}: {
  title: string;
  idleDescription?: string;
  editingDescription?: string;
  doneLabel?: string;
  isEditing: boolean;
  onToggleEdit: () => void;
  onReset: () => void;
  className?: string;
}) {
  return (
    <section className={`${className} flex flex-wrap items-center justify-between gap-3 rounded-3xl border border-white/10 px-4 py-3 ${isEditing ? "sticky top-3 z-30 border-white/15 bg-[#1b1b1b]/96 shadow-[0_18px_48px_rgba(0,0,0,0.55)] backdrop-blur-xl" : "bg-white/[0.03]"}`}>
      <div className="flex items-center gap-3">
        <div className="rounded-2xl border border-[var(--app-accent)]/20 bg-[var(--app-accent-soft)] p-2 text-white/80"><RectangleGroupIcon className="h-5 w-5" /></div>
        <div>
          <p className="text-sm font-semibold text-white">{title}</p>
          <p className="text-xs text-white/40">{isEditing ? editingDescription : idleDescription}</p>
        </div>
      </div>
      <div className="flex flex-wrap gap-2">
        {isEditing && <button type="button" onClick={onReset} className="rounded-2xl border border-white/10 bg-white/[0.04] px-4 py-2 text-sm font-semibold text-white/65 transition hover:bg-white/8 hover:text-white focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/55">Reset</button>}
        <button type="button" onClick={onToggleEdit} className={`inline-flex items-center gap-2 rounded-2xl border px-4 py-2 text-sm font-semibold transition focus:outline-none focus:ring-2 focus:ring-[var(--app-accent)]/55 ${isEditing ? "border-[var(--app-accent)] bg-[var(--app-accent-soft)] text-white" : "border-[var(--app-accent)]/25 bg-[var(--app-accent)] text-black shadow-lg shadow-[var(--app-accent)]/15 hover:opacity-90"}`}>
          <RectangleGroupIcon className="h-4 w-4" />{isEditing ? doneLabel : "Edit"}
        </button>
      </div>
    </section>
  );
}

export function ReorderableSection({ id, label, isEditing, isDragging, onDragStart, onDragOver, onDragEnd, children }: {
  id: string;
  label: string;
  isEditing: boolean;
  isDragging: boolean;
  onDragStart: (id: string, event: DragEvent<HTMLDivElement>) => void;
  onDragOver: (id: string, event: DragEvent<HTMLDivElement>) => void;
  onDragEnd: () => void;
  children: ReactNode;
}) {
  return (
    <div draggable={isEditing} onDragStart={(event) => onDragStart(id, event)} onDragOver={(event) => onDragOver(id, event)} onDragEnd={onDragEnd} className={`relative rounded-[1.75rem] transition ${isEditing ? "border border-dashed border-white/15 bg-white/[0.025] p-2" : "border border-transparent"} ${isDragging ? "opacity-45" : "opacity-100"}`}>
      {isEditing && <div className="mb-2 flex items-center justify-between gap-3 rounded-2xl border border-white/10 bg-black/20 px-3 py-2"><div className="flex items-center gap-2 text-sm font-semibold text-white/70"><span className="flex cursor-grab items-center text-white/45 active:cursor-grabbing"><EllipsisVerticalIcon className="h-5 w-3" /><EllipsisVerticalIcon className="-ml-1 h-5 w-3" /></span>{label}</div><span className="text-xs uppercase tracking-[0.2em] text-white/30">Drag</span></div>}
      {children}
    </div>
  );
}

import { useState } from "react";
import { Plus, X } from "lucide-react";
import type { Participant } from "../types/receipt";

interface Props {
  participants: Participant[];
  organizerId: string | null;
  onAdd: (name: string) => void;
  onRemove: (id: string) => void;
  onSetOrganizer: (id: string) => void;
  onUpdate: (id: string, patch: Partial<Participant>) => void;
}

export default function MemberManager({ participants, organizerId, onAdd, onRemove, onSetOrganizer, onUpdate }: Props) {
  const [name, setName] = useState("");
  const organizer = participants.find((p) => p.id === organizerId);

  const add = () => {
    const n = name.trim();
    if (!n || participants.length >= 12) return;
    onAdd(n);
    setName("");
  };

  return (
    <section className="rounded-2xl border border-slate-200 bg-white p-4">
      <h2 className="mb-3 text-base font-semibold text-slate-900">2. Who is splitting?</h2>

      <div className="flex flex-wrap gap-2">
        {participants.map((p) => (
          <span key={p.id} className="inline-flex items-center gap-2 rounded-full border border-slate-200 py-1 pl-2 pr-1 text-sm">
            <span className="h-3 w-3 rounded-full" style={{ background: p.avatar_color }} />
            {p.name}
            <label className="inline-flex items-center gap-1 text-xs text-slate-500">
              <input type="radio" name="organizer" checked={p.id === organizerId} onChange={() => onSetOrganizer(p.id)} />
              paid
            </label>
            {participants.length > 1 && (
              <button onClick={() => onRemove(p.id)} aria-label={`Remove ${p.name}`} className="rounded-full p-1 text-slate-400 hover:text-slate-700">
                <X size={14} />
              </button>
            )}
          </span>
        ))}
      </div>

      <div className="mt-3 flex gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          maxLength={20}
          placeholder="Add a name"
          className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm"
        />
        <button onClick={add} className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-sm text-white">
          <Plus size={14} /> Add
        </button>
      </div>

      {organizer && (
        <div className="mt-4 rounded-lg bg-slate-50 p-3">
          <p className="mb-2 text-xs text-slate-600">
            <b>{organizer.name}</b> paid the bill, so everyone else pays {organizer.name}. Optional payment details:
          </p>
          <div className="grid gap-2 sm:grid-cols-2">
            <input
              value={organizer.upi_id ?? ""}
              onChange={(e) => onUpdate(organizer.id, { upi_id: e.target.value })}
              placeholder="UPI ID (for ₹ bills), e.g. name@okaxis"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
            <input
              value={organizer.paypal_handle ?? ""}
              onChange={(e) => onUpdate(organizer.id, { paypal_handle: e.target.value })}
              placeholder="PayPal.me handle"
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm"
            />
          </div>
        </div>
      )}
    </section>
  );
}

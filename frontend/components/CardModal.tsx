"use client";

import { useState } from "react";
import type { Card as CardType } from "@/lib/types";

interface CardModalProps {
  card: CardType;
  onClose: () => void;
  onSave: (cardId: string, title: string, details: string) => void;
}

export default function CardModal({ card, onClose, onSave }: CardModalProps) {
  const [title, setTitle] = useState(card.title);
  const [details, setDetails] = useState(card.details);

  function handleSave() {
    const trimmedTitle = title.trim();
    if (!trimmedTitle) return;
    onSave(card.id, trimmedTitle, details.trim());
    onClose();
  }

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-navy-dark/40 p-4"
      onClick={onClose}
    >
      <div
        className="w-full max-w-md rounded-xl bg-white p-5 shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <label
          htmlFor="card-title"
          className="mb-1 block text-xs font-semibold tracking-wide text-gray-text uppercase"
        >
          Title
        </label>
        <input
          id="card-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          className="mb-4 w-full rounded-md border border-black/10 px-3 py-2 text-sm text-navy-dark focus:border-blue-primary focus:outline-none"
          autoFocus
        />

        <label
          htmlFor="card-details"
          className="mb-1 block text-xs font-semibold tracking-wide text-gray-text uppercase"
        >
          Details
        </label>
        <textarea
          id="card-details"
          value={details}
          onChange={(e) => setDetails(e.target.value)}
          rows={4}
          className="mb-5 w-full resize-none rounded-md border border-black/10 px-3 py-2 text-sm text-navy-dark focus:border-blue-primary focus:outline-none"
        />

        <div className="flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-md px-4 py-2 text-sm font-medium text-gray-text hover:bg-black/5"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSave}
            disabled={!title.trim()}
            className="rounded-md bg-purple-secondary px-4 py-2 text-sm font-medium text-white transition hover:opacity-90 disabled:opacity-40"
          >
            Save
          </button>
        </div>
      </div>
    </div>
  );
}

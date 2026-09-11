import { useState, type FormEvent } from "react";
import { parseLabels, type CardInput } from "@/lib/kanban";
import { CardMetaFields } from "@/components/CardMetaFields";

const initialFormState: Omit<CardInput, "labels"> = {
  title: "",
  details: "",
  priority: null,
  dueDate: null,
};

type NewCardFormProps = {
  onAdd: (input: CardInput) => void;
};

export const NewCardForm = ({ onAdd }: NewCardFormProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [formState, setFormState] = useState(initialFormState);
  const [labelsText, setLabelsText] = useState("");

  const reset = () => {
    setFormState(initialFormState);
    setLabelsText("");
  };

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    if (!formState.title.trim()) {
      return;
    }
    onAdd({
      title: formState.title.trim(),
      details: formState.details.trim(),
      priority: formState.priority,
      dueDate: formState.dueDate,
      labels: parseLabels(labelsText),
    });
    reset();
    setIsOpen(false);
  };

  return (
    <div className="mt-4">
      {isOpen ? (
        <form onSubmit={handleSubmit} className="space-y-3">
          <input
            value={formState.title}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, title: event.target.value }))
            }
            placeholder="Card title"
            className="w-full rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-3 py-2 text-sm font-medium text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
            required
          />
          <textarea
            value={formState.details}
            onChange={(event) =>
              setFormState((prev) => ({ ...prev, details: event.target.value }))
            }
            placeholder="Details"
            rows={3}
            className="w-full resize-none rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--gray-text)] outline-none transition focus:border-[var(--primary-blue)]"
          />
          <CardMetaFields
            priority={formState.priority}
            dueDate={formState.dueDate}
            labelsText={labelsText}
            onPriorityChange={(priority) =>
              setFormState((prev) => ({ ...prev, priority }))
            }
            onDueDateChange={(dueDate) => setFormState((prev) => ({ ...prev, dueDate }))}
            onLabelsTextChange={setLabelsText}
          />
          <div className="flex items-center gap-2">
            <button
              type="submit"
              className="rounded-full bg-[var(--secondary-purple)] px-4 py-2 text-xs font-semibold uppercase tracking-wide text-white transition hover:brightness-110"
            >
              Add card
            </button>
            <button
              type="button"
              onClick={() => {
                reset();
                setIsOpen(false);
              }}
              className="rounded-full border border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)] transition hover:text-[var(--navy-dark)]"
            >
              Cancel
            </button>
          </div>
        </form>
      ) : (
        <button
          type="button"
          onClick={() => setIsOpen(true)}
          className="w-full rounded-full border border-dashed border-[var(--stroke)] px-3 py-2 text-xs font-semibold uppercase tracking-wide text-[var(--primary-blue-text)] transition hover:border-[var(--primary-blue)]"
        >
          Add a card
        </button>
      )}
    </div>
  );
};

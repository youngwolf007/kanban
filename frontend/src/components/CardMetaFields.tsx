import { PRIORITIES, type Priority } from "@/lib/kanban";

type CardMetaFieldsProps = {
  priority: Priority | null;
  dueDate: string | null;
  labelsText: string;
  onPriorityChange: (priority: Priority | null) => void;
  onDueDateChange: (dueDate: string | null) => void;
  onLabelsTextChange: (text: string) => void;
};

const fieldClassName =
  "rounded-xl border border-[var(--stroke)] bg-white px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]";

export const CardMetaFields = ({
  priority,
  dueDate,
  labelsText,
  onPriorityChange,
  onDueDateChange,
  onLabelsTextChange,
}: CardMetaFieldsProps) => (
  <div className="flex flex-wrap gap-2">
    <select
      value={priority ?? ""}
      onChange={(event) =>
        onPriorityChange(event.target.value ? (event.target.value as Priority) : null)
      }
      aria-label="Card priority"
      className={fieldClassName}
    >
      <option value="">No priority</option>
      {PRIORITIES.map((option) => (
        <option key={option} value={option}>
          {option[0].toUpperCase() + option.slice(1)}
        </option>
      ))}
    </select>
    <input
      type="date"
      value={dueDate ?? ""}
      onChange={(event) => onDueDateChange(event.target.value || null)}
      aria-label="Card due date"
      className={fieldClassName}
    />
    <input
      type="text"
      value={labelsText}
      onChange={(event) => onLabelsTextChange(event.target.value)}
      placeholder="Labels, comma separated"
      aria-label="Card labels"
      className={`flex-1 min-w-[10rem] ${fieldClassName}`}
    />
  </div>
);

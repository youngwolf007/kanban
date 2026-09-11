import { PRIORITIES, type BoardFilters, type Priority } from "@/lib/kanban";

type BoardFilterBarProps = {
  filters: BoardFilters;
  onChange: (filters: BoardFilters) => void;
  matchCount: number;
  totalCount: number;
};

export const BoardFilterBar = ({
  filters,
  onChange,
  matchCount,
  totalCount,
}: BoardFilterBarProps) => (
  <div className="flex flex-wrap items-center gap-3 rounded-2xl border border-[var(--stroke)] bg-[var(--surface-strong)]/70 px-4 py-3 backdrop-blur">
    <input
      type="search"
      value={filters.query}
      onChange={(event) => onChange({ ...filters, query: event.target.value })}
      placeholder="Search title, details, or labels"
      aria-label="Search cards"
      className="min-w-[14rem] flex-1 rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
    />
    <select
      value={filters.priority}
      onChange={(event) =>
        onChange({ ...filters, priority: event.target.value as Priority | "all" })
      }
      aria-label="Filter by priority"
      className="rounded-xl border border-[var(--stroke)] bg-[var(--surface-strong)] px-3 py-2 text-sm text-[var(--navy-dark)] outline-none transition focus:border-[var(--primary-blue)]"
    >
      <option value="all">All priorities</option>
      {PRIORITIES.map((option) => (
        <option key={option} value={option}>
          {option[0].toUpperCase() + option.slice(1)}
        </option>
      ))}
    </select>
    <span
      data-testid="filter-summary"
      className="text-xs font-semibold uppercase tracking-wide text-[var(--gray-text)]"
    >
      {matchCount} of {totalCount} cards match
    </span>
  </div>
);

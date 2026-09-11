import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { BoardSwitcher } from "@/components/BoardSwitcher";
import type { BoardSummary } from "@/lib/api";

const boards: BoardSummary[] = [
  { id: 1, name: "Roadmap", updatedAt: "2026-01-02T00:00:00Z" },
  { id: 2, name: "Personal", updatedAt: "2026-01-01T00:00:00Z" },
];

const renderSwitcher = (overrides: Partial<Parameters<typeof BoardSwitcher>[0]> = {}) => {
  const props = {
    boards,
    currentBoardId: 1,
    onSwitch: vi.fn(),
    onCreate: vi.fn(),
    onRename: vi.fn(),
    onDelete: vi.fn(),
    ...overrides,
  };
  render(<BoardSwitcher {...props} />);
  return props;
};

describe("BoardSwitcher", () => {
  it("shows the current board's name on the trigger", () => {
    renderSwitcher();
    expect(screen.getByTestId("board-switcher")).toHaveTextContent("Roadmap");
  });

  it("opens to list every board", async () => {
    renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));

    expect(screen.getByTestId("board-menu")).toBeInTheDocument();
    expect(screen.getByTestId("board-option-1")).toHaveTextContent("Roadmap");
    expect(screen.getByTestId("board-option-2")).toHaveTextContent("Personal");
  });

  it("switches to the clicked board and closes the menu", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByText("Personal"));

    expect(props.onSwitch).toHaveBeenCalledWith(2);
    expect(screen.queryByTestId("board-menu")).not.toBeInTheDocument();
  });

  it("creates a new board", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByTestId("board-create"));

    expect(props.onCreate).toHaveBeenCalled();
  });

  it("renames a board", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Rename Roadmap"));

    const input = screen.getByLabelText("New name for Roadmap");
    await userEvent.clear(input);
    await userEvent.type(input, "Q1 plan{Enter}");

    expect(props.onRename).toHaveBeenCalledWith(1, "Q1 plan");
  });

  it("does not rename to a blank name", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Rename Roadmap"));
    await userEvent.clear(screen.getByLabelText("New name for Roadmap"));
    await userEvent.keyboard("{Enter}");

    expect(props.onRename).not.toHaveBeenCalled();
  });

  it("deletes a board", async () => {
    const props = renderSwitcher();
    await userEvent.click(screen.getByTestId("board-switcher"));
    await userEvent.click(screen.getByLabelText("Delete Personal"));

    expect(props.onDelete).toHaveBeenCalledWith(2);
  });
});

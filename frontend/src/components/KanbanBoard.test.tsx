import { render, screen, within } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { KanbanBoard } from "@/components/KanbanBoard";
import { initialData } from "@/lib/kanban";

const getFirstColumn = () => screen.getAllByTestId(/column-/i)[0];

describe("KanbanBoard", () => {
  it("renders five columns", () => {
    render(<KanbanBoard />);
    expect(screen.getAllByTestId(/column-/i)).toHaveLength(5);
  });

  it("renders every seeded card", () => {
    render(<KanbanBoard />);
    for (const card of Object.values(initialData.cards)) {
      expect(screen.getByText(card.title)).toBeInTheDocument();
    }
  });

  it("renames a column", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const input = within(column).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "New Name");
    expect(input).toHaveValue("New Name");
  });

  it("shows the renamed column in the header summary", async () => {
    render(<KanbanBoard />);
    const input = within(getFirstColumn()).getByLabelText("Column title");
    await userEvent.clear(input);
    await userEvent.type(input, "Renamed");
    const header = screen.getByRole("banner");
    expect(within(header).getByText("Renamed")).toBeInTheDocument();
  });

  it("adds and removes a card", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    const addButton = within(column).getByRole("button", {
      name: /add a card/i,
    });
    await userEvent.click(addButton);

    const titleInput = within(column).getByPlaceholderText(/card title/i);
    await userEvent.type(titleInput, "New card");
    const detailsInput = within(column).getByPlaceholderText(/details/i);
    await userEvent.type(detailsInput, "Notes");

    await userEvent.click(within(column).getByRole("button", { name: /add card/i }));

    expect(within(column).getByText("New card")).toBeInTheDocument();

    const deleteButton = within(column).getByRole("button", {
      name: /delete new card/i,
    });
    await userEvent.click(deleteButton);

    expect(within(column).queryByText("New card")).not.toBeInTheDocument();
  });

  it("updates the card count when a card is added", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    expect(within(column).getByText("2 cards")).toBeInTheDocument();

    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "Counted"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(within(column).getByText("3 cards")).toBeInTheDocument();
  });

  it("falls back to placeholder details when none are given", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "No details card"
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(within(column).getByText("No details yet.")).toBeInTheDocument();
  });

  it("does not add a card when the title is only whitespace", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.type(
      within(column).getByPlaceholderText(/card title/i),
      "   "
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /add card/i })
    );

    expect(within(column).getByText("2 cards")).toBeInTheDocument();
  });

  it("closes the new card form on cancel", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /add a card/i })
    );
    await userEvent.click(
      within(column).getByRole("button", { name: /cancel/i })
    );

    expect(
      within(column).queryByPlaceholderText(/card title/i)
    ).not.toBeInTheDocument();
  });

  it("deletes only the card asked for", async () => {
    render(<KanbanBoard />);
    const column = getFirstColumn();
    await userEvent.click(
      within(column).getByRole("button", { name: /delete align roadmap themes/i })
    );

    expect(within(column).queryByText("Align roadmap themes")).not.toBeInTheDocument();
    expect(within(column).getByText("Gather customer signals")).toBeInTheDocument();
  });
});

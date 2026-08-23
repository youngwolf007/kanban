import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import Board from "./Board";

describe("Board", () => {
  it("renders the 5 seeded columns with their cards", () => {
    render(<Board />);
    expect(screen.getByText("Backlog")).toBeInTheDocument();
    expect(screen.getByText("To Do")).toBeInTheDocument();
    expect(screen.getByText("In Progress")).toBeInTheDocument();
    expect(screen.getByText("Review")).toBeInTheDocument();
    expect(screen.getByText("Done")).toBeInTheDocument();
    expect(screen.getByText("Research competitor apps")).toBeInTheDocument();
  });

  it("renames a column", async () => {
    const user = userEvent.setup();
    render(<Board />);

    await user.click(screen.getByText("Backlog"));
    const input = screen.getByDisplayValue("Backlog");
    await user.clear(input);
    await user.type(input, "Ideas{Enter}");

    expect(screen.getByText("Ideas")).toBeInTheDocument();
    expect(screen.queryByText("Backlog")).not.toBeInTheDocument();
  });

  it("adds a new card to a column", async () => {
    const user = userEvent.setup();
    render(<Board />);

    const addButtons = screen.getAllByRole("button", { name: "+ Add a card" });
    await user.click(addButtons[0]);
    await user.type(screen.getByPlaceholderText("Card title"), "Write launch plan");
    await user.click(screen.getByRole("button", { name: "Add" }));

    expect(screen.getByText("Write launch plan")).toBeInTheDocument();
  });

  it("deletes a card", async () => {
    const user = userEvent.setup();
    render(<Board />);

    expect(screen.getByText("Research competitor apps")).toBeInTheDocument();
    const deleteButtons = screen.getAllByRole("button", { name: "Delete card" });
    await user.click(deleteButtons[0]);

    expect(screen.queryByText("Research competitor apps")).not.toBeInTheDocument();
  });

  it("opens a card and saves edits via the modal", async () => {
    const user = userEvent.setup();
    render(<Board />);

    await user.click(screen.getByText("Research competitor apps"));
    const titleInput = screen.getByLabelText("Title");
    await user.clear(titleInput);
    await user.type(titleInput, "Research rivals");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(screen.getByText("Research rivals")).toBeInTheDocument();
    expect(screen.queryByText("Research competitor apps")).not.toBeInTheDocument();
  });
});

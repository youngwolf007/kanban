import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import CardModal from "./CardModal";

const card = { id: "card-1", title: "Sample", details: "Some details" };

describe("CardModal", () => {
  it("calls onSave with trimmed title and details", async () => {
    const user = userEvent.setup();
    const onSave = vi.fn();
    const onClose = vi.fn();
    render(<CardModal card={card} onClose={onClose} onSave={onSave} />);

    const titleInput = screen.getByDisplayValue("Sample");
    await user.clear(titleInput);
    await user.type(titleInput, "  Updated title  ");
    await user.click(screen.getByRole("button", { name: "Save" }));

    expect(onSave).toHaveBeenCalledWith("card-1", "Updated title", "Some details");
    expect(onClose).toHaveBeenCalled();
  });

  it("disables save when title is empty", async () => {
    const user = userEvent.setup();
    render(<CardModal card={card} onClose={vi.fn()} onSave={vi.fn()} />);

    const titleInput = screen.getByDisplayValue("Sample");
    await user.clear(titleInput);

    expect(screen.getByRole("button", { name: "Save" })).toBeDisabled();
  });

  it("calls onClose when cancel is clicked", async () => {
    const user = userEvent.setup();
    const onClose = vi.fn();
    render(<CardModal card={card} onClose={onClose} onSave={vi.fn()} />);

    await user.click(screen.getByRole("button", { name: "Cancel" }));
    expect(onClose).toHaveBeenCalled();
  });
});

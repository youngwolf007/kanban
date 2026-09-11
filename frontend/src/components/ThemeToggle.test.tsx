import { render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { ThemeToggle } from "@/components/ThemeToggle";

const mockMatchMedia = (matches: boolean) => {
  vi.stubGlobal(
    "matchMedia",
    vi.fn().mockReturnValue({
      matches,
      media: "(prefers-color-scheme: dark)",
      addEventListener: () => {},
      removeEventListener: () => {},
    })
  );
};

afterEach(() => {
  localStorage.clear();
  document.documentElement.removeAttribute("data-theme");
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe("ThemeToggle", () => {
  it("starts in light mode when the system has no preference", () => {
    mockMatchMedia(false);
    render(<ThemeToggle />);

    expect(screen.getByTestId("theme-toggle")).toHaveAccessibleName(
      "Switch to dark mode"
    );
    expect(document.documentElement.dataset.theme).toBe("light");
  });

  it("starts in dark mode when the OS prefers dark and nothing is stored", () => {
    mockMatchMedia(true);
    render(<ThemeToggle />);

    expect(screen.getByTestId("theme-toggle")).toHaveAccessibleName(
      "Switch to light mode"
    );
    expect(document.documentElement.dataset.theme).toBe("dark");
  });

  it("prefers a stored theme over the system preference", () => {
    mockMatchMedia(true);
    localStorage.setItem("theme", "light");
    render(<ThemeToggle />);

    expect(screen.getByTestId("theme-toggle")).toHaveAccessibleName(
      "Switch to dark mode"
    );
  });

  it("toggles the theme, the document attribute, and storage on click", async () => {
    mockMatchMedia(false);
    render(<ThemeToggle />);

    await userEvent.click(screen.getByTestId("theme-toggle"));

    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
    expect(screen.getByTestId("theme-toggle")).toHaveAccessibleName(
      "Switch to light mode"
    );
  });

  it("toggles back to light on a second click", async () => {
    mockMatchMedia(false);
    render(<ThemeToggle />);

    await userEvent.click(screen.getByTestId("theme-toggle"));
    await userEvent.click(screen.getByTestId("theme-toggle"));

    expect(document.documentElement.dataset.theme).toBe("light");
    expect(localStorage.getItem("theme")).toBe("light");
  });
});

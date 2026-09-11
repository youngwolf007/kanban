import {
  getStoredTheme,
  getSystemTheme,
  persistTheme,
  resolveTheme,
  setDocumentTheme,
} from "@/lib/theme";

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

describe("getStoredTheme", () => {
  it("returns null when nothing is stored", () => {
    expect(getStoredTheme()).toBeNull();
  });

  it("returns a previously stored theme", () => {
    localStorage.setItem("theme", "dark");
    expect(getStoredTheme()).toBe("dark");
  });

  it("ignores garbage values", () => {
    localStorage.setItem("theme", "blue");
    expect(getStoredTheme()).toBeNull();
  });

  it("returns null when localStorage throws", () => {
    vi.spyOn(Storage.prototype, "getItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    expect(getStoredTheme()).toBeNull();
  });
});

describe("getSystemTheme", () => {
  it("reads dark from matchMedia", () => {
    mockMatchMedia(true);
    expect(getSystemTheme()).toBe("dark");
  });

  it("reads light from matchMedia", () => {
    mockMatchMedia(false);
    expect(getSystemTheme()).toBe("light");
  });
});

describe("resolveTheme", () => {
  it("prefers a stored theme over the system preference", () => {
    mockMatchMedia(true);
    localStorage.setItem("theme", "light");
    expect(resolveTheme()).toBe("light");
  });

  it("falls back to the system preference when nothing is stored", () => {
    mockMatchMedia(true);
    expect(resolveTheme()).toBe("dark");
  });
});

describe("setDocumentTheme", () => {
  it("sets data-theme on the document element without touching storage", () => {
    setDocumentTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBeNull();
  });
});

describe("persistTheme", () => {
  it("sets data-theme and stores the choice", () => {
    persistTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
    expect(localStorage.getItem("theme")).toBe("dark");
  });

  it("still applies the theme when storage throws", () => {
    vi.spyOn(Storage.prototype, "setItem").mockImplementation(() => {
      throw new Error("blocked");
    });
    persistTheme("dark");
    expect(document.documentElement.dataset.theme).toBe("dark");
  });
});

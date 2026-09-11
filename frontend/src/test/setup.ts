import "@testing-library/jest-dom";

// jsdom does not implement matchMedia. ThemeToggle (mounted by App in every test
// that renders it) calls it to read the OS color scheme preference.
if (!window.matchMedia) {
  window.matchMedia = (query: string) =>
    ({
      matches: false,
      media: query,
      onchange: null,
      addListener: () => {},
      removeListener: () => {},
      addEventListener: () => {},
      removeEventListener: () => {},
      dispatchEvent: () => false,
    }) as unknown as MediaQueryList;
}

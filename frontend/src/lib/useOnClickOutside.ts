import { useEffect, type RefObject } from "react";

export const useOnClickOutside = (
  ref: RefObject<HTMLElement | null>,
  onOutsideClick: () => void
) => {
  useEffect(() => {
    const handlePointerDown = (event: PointerEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) {
        onOutsideClick();
      }
    };
    document.addEventListener("pointerdown", handlePointerDown);
    return () => document.removeEventListener("pointerdown", handlePointerDown);
  }, [ref, onOutsideClick]);
};

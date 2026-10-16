import { useEffect, useRef, type KeyboardEvent, type PointerEvent, type ReactNode } from "react";

interface Props {
  name: string;
  pressed: boolean;
  onChange: (pressed: boolean) => void;
  tone: "start" | "stop";
  icon: ReactNode;
  children: ReactNode;
}

/**
 * Momentary PLC input, not a latching toggle:
 * pointer / touch capture, keyboard press+release, cancel, blur and tab hide
 * always de-energize the input. Native pointer events avoid synthetic clicks.
 */
export function MomentaryPushButton({
  name, pressed, onChange, tone, icon, children,
}: Props) {
  const pointer = useRef<number | null>(null);
  const keys = useRef<Set<string>>(new Set());
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  const held = () => pointer.current !== null || keys.current.size > 0;
  const releaseAll = () => {
    pointer.current = null;
    keys.current.clear();
    onChangeRef.current(false);
  };
  const releasePointer = (id: number) => {
    if (pointer.current !== id) return;
    pointer.current = null;
    onChangeRef.current(held());
  };

  useEffect(() => {
    const onWindowBlur = () => releaseAll();
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") releaseAll();
    };
    window.addEventListener("blur", onWindowBlur);
    document.addEventListener("visibilitychange", onVisibilityChange);
    return () => {
      window.removeEventListener("blur", onWindowBlur);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      // An interrupted press cannot leave a PLC digital input energized.
      if (held()) releaseAll();
    };
  }, []);

  const onPointerDown = (event: PointerEvent<HTMLButtonElement>) => {
    if (pointer.current !== null || !event.isPrimary ||
      (event.pointerType === "mouse" && event.button !== 0)) return;
    pointer.current = event.pointerId;
    event.currentTarget.setPointerCapture(event.pointerId);
    onChangeRef.current(true);
  };
  const onKeyDown = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (event.repeat || keys.current.has(event.key)) return;
    keys.current.add(event.key);
    onChangeRef.current(true);
  };
  const onKeyUp = (event: KeyboardEvent<HTMLButtonElement>) => {
    if (event.key !== " " && event.key !== "Enter") return;
    event.preventDefault();
    if (!keys.current.has(event.key)) return;
    keys.current.delete(event.key);
    onChangeRef.current(held());
  };

  const background = tone === "start"
    ? pressed
      ? "border-emerald-300 bg-emerald-600 text-white"
      : "border-emerald-700 bg-emerald-950 text-emerald-300"
    : pressed
      ? "border-red-300 bg-red-600 text-white"
      : "border-red-700 bg-red-950 text-red-300";

  return (
    <button type="button" aria-label={name} aria-pressed={pressed}
      title={"Pulsador momentáneo " + name + " · mantener presionado"}
      onPointerDown={onPointerDown}
      onPointerUp={(event) => releasePointer(event.pointerId)}
      onPointerCancel={(event) => releasePointer(event.pointerId)}
      onLostPointerCapture={(event) => releasePointer(event.pointerId)}
      onKeyDown={onKeyDown}
      onKeyUp={onKeyUp}
      onBlur={releaseAll}
      className={"flex h-16 w-20 touch-none select-none flex-col items-center justify-center gap-0.5 rounded-md border-2 text-xs font-bold focus-visible:outline-2 focus-visible:outline-sky-500 " + background}>
      {icon}
      {children}
    </button>
  );
}

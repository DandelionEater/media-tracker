import { useState, useEffect, useRef } from "react";

type Props = {
  onSearch: (query: string) => void;
};

export function SearchBar({ onSearch }: Props) {
  const [value, setValue] = useState("");
  const inputRef = useRef<HTMLInputElement>(null);
  const valueRef = useRef(value);

  // 🔥 Focus on first mount
  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  useEffect(() => {
    valueRef.current = value;
  }, [value]);

  // 🔥 Focus when overlay is shown
  useEffect(() => {
    window.api.onFocusSearch(() => {
      if (valueRef.current.length < 2) {
          setValue("");
      }

      inputRef.current?.focus();
      inputRef.current?.select();
    });
  }, []);

  // debounce
  useEffect(() => {
    const delay = setTimeout(() => {
      onSearch(value);
    }, 300);

    return () => clearTimeout(delay);
  }, [value]);

  return (
    <div className="w-full flex justify-center mt-20">
      <input
        ref={inputRef}
        type="text"
        placeholder="Search anime..."
        value={value}
        onChange={(e) => setValue(e.target.value)}
        className="
          w-100
          px-5 py-3
          rounded-full
          bg-white/5
          backdrop-blur-md
          text-white
          outline-none
          transition-all duration-200
          focus:ring-2 focus:ring-white/20
        "
      />
    </div>
  );
}
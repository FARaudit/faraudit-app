"use client";

// Reusable NAICS combobox — type-to-search replacement for plain <select>.
// Accepts either string[] (codes only) or Array<{ code, label }> (code +
// description). Real-time filter on code substring OR label substring.
// Keyboard: ArrowDown/Up to navigate, Enter to select, Escape to close.
// Used in Opportunities, Defense Spending, Teaming Partners, Wage Benchmarks.

import { useState, useRef, useEffect, useMemo } from "react";

export interface NaicsOption {
  code: string;
  label?: string;
}

export type NaicsComboboxOptions =
  | Array<string>
  | Array<NaicsOption>;

interface Props {
  value: string;
  onChange: (code: string) => void;
  options: NaicsComboboxOptions;
  placeholder?: string;
  includeAll?: boolean;
  allLabel?: string;
  className?: string;
}

function normalize(opts: NaicsComboboxOptions): NaicsOption[] {
  if (opts.length === 0) return [];
  if (typeof opts[0] === "string") {
    return (opts as string[]).map((code) => ({ code }));
  }
  return opts as NaicsOption[];
}

export default function NaicsCombobox({
  value,
  onChange,
  options,
  placeholder = "Search NAICS — e.g. 336413 or Aircraft",
  includeAll = true,
  allLabel = "All NAICS",
  className = "naics-select"
}: Props) {
  const normalized = useMemo(() => normalize(options), [options]);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState("");
  const [highlight, setHighlight] = useState(0);
  const wrapRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  // Display text reflects current value when input not focused
  const valueLabel = useMemo(() => {
    if (!value) return allLabel;
    const found = normalized.find((o) => o.code === value);
    return found ? (found.label ? `${found.code} — ${found.label}` : found.code) : value;
  }, [value, normalized, allLabel]);

  const [displayText, setDisplayText] = useState(valueLabel);

  useEffect(() => {
    setDisplayText(valueLabel);
  }, [valueLabel]);

  // Filter options on query (lowercased substring match on code OR label)
  const filtered = useMemo(() => {
    const q = query.trim().toLowerCase();
    const list: Array<NaicsOption & { isAll?: boolean }> = [];
    if (includeAll && (!q || allLabel.toLowerCase().includes(q))) {
      list.push({ code: "", label: allLabel, isAll: true });
    }
    if (!q) {
      list.push(...normalized);
    } else {
      list.push(
        ...normalized.filter(
          (o) => o.code.toLowerCase().includes(q) || (o.label || "").toLowerCase().includes(q)
        )
      );
    }
    return list;
  }, [query, normalized, includeAll, allLabel]);

  // Close on outside click
  useEffect(() => {
    if (!open) return;
    function onDown(e: MouseEvent) {
      if (wrapRef.current && !wrapRef.current.contains(e.target as Node)) {
        setOpen(false);
        setQuery("");
        setDisplayText(valueLabel);
      }
    }
    document.addEventListener("mousedown", onDown);
    return () => document.removeEventListener("mousedown", onDown);
  }, [open, valueLabel]);

  // Reset highlight when filtered list changes
  useEffect(() => {
    if (highlight >= filtered.length) setHighlight(Math.max(0, filtered.length - 1));
  }, [filtered.length, highlight]);

  function select(opt: NaicsOption | { code: string; isAll?: boolean }) {
    onChange(opt.code);
    setOpen(false);
    setQuery("");
    setDisplayText(opt.code ? (("label" in opt && opt.label) ? `${opt.code} — ${opt.label}` : opt.code) : allLabel);
    inputRef.current?.blur();
  }

  function onKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      if (!open) setOpen(true);
      setHighlight((h) => Math.min(filtered.length - 1, h + 1));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setHighlight((h) => Math.max(0, h - 1));
    } else if (e.key === "Enter") {
      e.preventDefault();
      const target = filtered[highlight];
      if (target) select(target);
    } else if (e.key === "Escape") {
      setOpen(false);
      setQuery("");
      setDisplayText(valueLabel);
      inputRef.current?.blur();
    }
  }

  return (
    <div ref={wrapRef} style={{ position: "relative", display: "inline-block", minWidth: 220 }}>
      <input
        ref={inputRef}
        className={className}
        type="text"
        value={open ? query : displayText}
        placeholder={placeholder}
        onFocus={() => { setOpen(true); setQuery(""); setHighlight(0); }}
        onChange={(e) => { setQuery(e.target.value); setOpen(true); setHighlight(0); }}
        onKeyDown={onKey}
        style={{ width: "100%", boxSizing: "border-box" }}
        autoComplete="off"
        spellCheck={false}
      />
      {open && filtered.length > 0 && (
        <div
          role="listbox"
          style={{
            position: "absolute",
            top: "100%",
            left: 0,
            right: 0,
            zIndex: 50,
            marginTop: 2,
            maxHeight: 280,
            overflowY: "auto",
            background: "#060F1C",
            border: "1px solid rgba(201,168,76,.25)",
            borderRadius: 4,
            boxShadow: "0 8px 24px rgba(0,0,0,.4)"
          }}
        >
          {filtered.map((opt, i) => {
            const isHighlighted = i === highlight;
            return (
              <div
                key={`${opt.code}-${i}`}
                role="option"
                aria-selected={isHighlighted}
                onMouseDown={(e) => { e.preventDefault(); select(opt); }}
                onMouseEnter={() => setHighlight(i)}
                style={{
                  padding: "7px 12px",
                  fontFamily: "'JetBrains Mono', monospace",
                  fontSize: 11,
                  color: isHighlighted ? "#C9A84C" : "#E2E8F2",
                  background: isHighlighted ? "rgba(201,168,76,.08)" : "transparent",
                  cursor: "pointer",
                  borderBottom: "1px solid rgba(201,168,76,.06)"
                }}
              >
                {opt.code === "" ? (
                  <span style={{ fontStyle: "italic", opacity: 0.7 }}>{opt.label || allLabel}</span>
                ) : (
                  <>
                    <span style={{ fontWeight: 700 }}>{opt.code}</span>
                    {opt.label && <span style={{ marginLeft: 8, opacity: 0.7 }}>{opt.label}</span>}
                  </>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

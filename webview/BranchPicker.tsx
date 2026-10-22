import { useEffect, useId, useRef, useState } from 'react';
import type { BranchOption } from '../src/model';

export function BranchPicker({ label, value, options, disabled, onChange }: {
  label: string; value: string; options: BranchOption[]; disabled: boolean; onChange: (ref: string) => void;
}) {
  const id = useId();
  const input = useRef<HTMLInputElement>(null);
  const list = useRef<HTMLDivElement>(null);
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(-1);
  const selected = options.find(option => option.ref === value);
  const [previousValue, setPreviousValue] = useState(value);
  if (previousValue !== value) { setPreviousValue(value); setOpen(false); setQuery(''); setActive(-1); }
  const groups = ['Local branches', 'Remote branches', 'Snapshots'] as const;
  const matches = groups.flatMap(group => options.filter(option => option.group === group && option.label.toLowerCase().includes(query.toLowerCase())));
  const activeOption = matches[active];
  const close = () => { setOpen(false); setQuery(''); setActive(-1); };
  const choose = (option: BranchOption) => { close(); if (option.ref !== value) onChange(option.ref); };
  useEffect(() => { list.current?.querySelectorAll('[role="option"]')[active]?.scrollIntoView({ block: 'nearest' }); }, [active]);
  return <div className="branch-field branch-picker">
    <label htmlFor={id}>{label}</label>
    <div className="branch-input-wrap">
      <input ref={input} id={id} role="combobox" aria-label={`${label} branch`} aria-autocomplete="list" aria-expanded={open} aria-controls={`${id}-list`} aria-activedescendant={open && activeOption ? `${id}-option-${active}` : undefined}
        disabled={disabled} autoComplete="off" spellCheck={false} value={open ? query : selected?.label ?? ''} placeholder={options.length ? 'Search branches…' : 'Loading branches…'}
        title={selected?.label} onBlur={close} onFocus={() => { setOpen(true); setQuery(''); setActive(-1); }} onClick={() => setOpen(true)}
        onChange={event => { setQuery(event.target.value); setActive(-1); setOpen(true); }}
        onKeyDown={event => {
          if (event.nativeEvent.isComposing) return;
          if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(); }
          if (event.key === 'ArrowDown' || event.key === 'ArrowUp') {
            event.preventDefault(); setOpen(true);
            setActive(index => matches.length ? (index + (event.key === 'ArrowDown' ? 1 : index < 0 ? 0 : -1) + matches.length) % matches.length : -1);
          }
          if (event.key === 'Enter' && open) { event.preventDefault(); if (activeOption) choose(activeOption); else if (matches.length === 1) choose(matches[0]); }
          if (event.key === 'Tab') close();
        }}/>
      <span className="branch-chevron" aria-hidden="true">⌄</span>
    </div>
    {open && !disabled && <div className="branch-popup">
      <div role="listbox" id={`${id}-list`} aria-label={`${label} branches`} ref={list}>
        {groups.map(group => {
          const entries = matches.filter(option => option.group === group);
          return entries.length > 0 && <fieldset aria-label={group} key={group}><legend className="branch-group">{group}</legend>{entries.map(option => {
            const index = matches.indexOf(option);
            return <button type="button" role="option" tabIndex={-1} aria-selected={index === active} id={`${id}-option-${index}`} key={option.ref} data-active={index === active} title={option.label}
              onMouseDown={event => event.preventDefault()} onMouseMove={() => setActive(index)} onClick={() => { choose(option); input.current?.focus(); }}>
              <span>{option.label}</span>{option.ref === value && <span aria-hidden="true">✓</span>}
            </button>;
          })}</fieldset>;
        })}
      </div>
      <div className="branch-results" aria-live="polite">{matches.length ? `${matches.length} branches · ↑↓ navigate · Enter select` : 'No matching branches'}</div>
    </div>}
  </div>;
}

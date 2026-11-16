# 8. Advanced patterns (LOW)

## `useEffectEvent` deps

Values from `useEffectEvent` are stable — do NOT add them to effect deps.

## Event handler refs

For stable callbacks passed to memoized children:

```tsx
const handlerRef = useRef(handler);
useEffect(() => { handlerRef.current = handler; });
const stable = useCallback((arg) => handlerRef.current(arg), []);
```

## Init once per app load

For module-level singletons (telemetry, logger), guard with a module-scope flag — not `useEffect`.

## `useLatest` for stable callback refs

```tsx
function useLatest<T>(value: T) {
  const ref = useRef(value);
  ref.current = value;
  return ref;
}
```

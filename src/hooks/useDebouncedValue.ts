import { useState, useEffect } from 'react';

/**
 * Custom hook that debounces a value to prevent excessive updates
 * @param value - The value to debounce
 * @param delay - The delay in milliseconds (default: 300ms)
 * @returns The debounced value
 */
export function useDebouncedValue<T>(value: T, delay: number = 300): [T] {
  const [debouncedValue, setDebouncedValue] = useState<T>(value);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(value);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [value, delay]);

  return [debouncedValue];
}

/**
 * Custom hook for debounced input handling with immediate display updates
 * @param initialValue - Initial value
 * @param delay - Debounce delay in milliseconds
 * @returns [displayValue, debouncedValue, setValue]
 */
export function useDebouncedInput<T>(initialValue: T, delay: number = 300): [T, T, (value: T) => void] {
  const [displayValue, setDisplayValue] = useState<T>(initialValue);
  const [debouncedValue, setDebouncedValue] = useState<T>(initialValue);

  useEffect(() => {
    const handler = setTimeout(() => {
      setDebouncedValue(displayValue);
    }, delay);

    return () => {
      clearTimeout(handler);
    };
  }, [displayValue, delay]);

  const setValue = (value: T) => {
    setDisplayValue(value);
  };

  return [displayValue, debouncedValue, setValue];
}
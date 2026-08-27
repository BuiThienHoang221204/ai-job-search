import { z } from 'zod';

export const cappedText = (max: number, hint: string) =>
  z
    .string()
    .describe(`${hint} Tối đa ${max} ký tự.`)
    .transform((value) => value.trim().slice(0, max));

export const cappedTextVi = (max: number, hint: string) =>
  z
    .string()
    .describe(`${hint} Tối đa ${max} ký tự. Viết bằng tiếng Việt có dấu.`)
    .transform((value) => value.trim().slice(0, max));

export const optionalCappedText = (max: number, hint: string) =>
  z
    .string()
    .nullable()
    .describe(`${hint} Tối đa ${max} ký tự. null nếu không có.`)
    .transform((value) =>
      value === null ? null : value.trim().slice(0, max) || null,
    )
    .default(null);

export const boundedList = (item: z.ZodType<string, string>, max: number) =>
  z
    .array(item)
    .transform((items) => items.filter((s) => s.length > 0).slice(0, max));

export const boundedObjectList = <T>(
  item: z.ZodType<T, unknown>,
  max: number,
  keep: (value: T) => boolean,
) => z.array(item).transform((items) => items.filter(keep).slice(0, max));

export const looseEnum = <const T extends readonly [string, ...string[]]>(
  values: T,
  fallback: T[number],
) => z.enum(values).catch(fallback).default(fallback);

export const boundedInt = (min: number, max: number, hint: string) =>
  z
    .number()
    .describe(`${hint} Số nguyên từ ${min} tới ${max}.`)
    .transform((value) => Math.min(max, Math.max(min, Math.round(value))));

export const optionalYears = (max: number, hint: string) =>
  z
    .number()
    .nullable()
    .describe(hint)
    .transform((value) =>
      value === null || value < 0 || value > max ? null : Math.round(value),
    )
    .default(null);

export const requiredCappedText = (max: number, hint: string) =>
  z
    .string()
    .min(1)
    .describe(`${hint} Tối đa ${max} ký tự.`)
    .transform((value) => value.trim().slice(0, max));

export const requiredCappedTextVi = (max: number, hint: string) =>
  z
    .string()
    .min(1)
    .describe(`${hint} Tối đa ${max} ký tự. Viết bằng tiếng Việt có dấu.`)
    .transform((value) => value.trim().slice(0, max));

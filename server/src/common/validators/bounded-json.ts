import { registerDecorator, type ValidationOptions } from 'class-validator';

export type JsonBounds = {
  maxBytes: number;
  maxItems: number;
  maxDepth?: number;
};

const DEFAULT_MAX_DEPTH = 6;

export type BoundsFailure =
  'not-json-container' | 'too-many-items' | 'too-deep' | 'too-large';

function depthOf(value: unknown, limit: number, current = 1): number {
  if (current > limit) return current;
  if (Array.isArray(value)) {
    return value.reduce<number>(
      (deepest, item) => Math.max(deepest, depthOf(item, limit, current + 1)),
      current,
    );
  }
  if (typeof value === 'object' && value !== null) {
    return Object.values(value).reduce<number>(
      (deepest, item) => Math.max(deepest, depthOf(item, limit, current + 1)),
      current,
    );
  }
  return current;
}

export function checkJsonBounds(
  value: unknown,
  bounds: JsonBounds,
): BoundsFailure | null {
  const isContainer =
    Array.isArray(value) || (typeof value === 'object' && value !== null);
  if (!isContainer) return 'not-json-container';

  if (Array.isArray(value) && value.length > bounds.maxItems) {
    return 'too-many-items';
  }

  const maxDepth = bounds.maxDepth ?? DEFAULT_MAX_DEPTH;
  if (depthOf(value, maxDepth) > maxDepth) return 'too-deep';

  let serialised: string;
  try {
    serialised = JSON.stringify(value);
  } catch {
    return 'not-json-container';
  }
  if (Buffer.byteLength(serialised, 'utf8') > bounds.maxBytes) {
    return 'too-large';
  }

  return null;
}

const MESSAGES: Record<BoundsFailure, string> = {
  'not-json-container': 'phải là một mảng hoặc một đối tượng JSON',
  'too-many-items': 'có quá nhiều phần tử',
  'too-deep': 'lồng nhau quá sâu',
  'too-large': 'vượt quá dung lượng cho phép',
};

export function IsBoundedJson(
  bounds: JsonBounds,
  validationOptions?: ValidationOptions,
) {
  return function (object: object, propertyName: string): void {
    registerDecorator({
      name: 'isBoundedJson',
      target: object.constructor,
      propertyName,
      options: validationOptions,
      validator: {
        validate: (value: unknown) => checkJsonBounds(value, bounds) === null,
        defaultMessage: (args) => {
          const failure = checkJsonBounds(args?.value, bounds);
          const reason = failure ? MESSAGES[failure] : 'không hợp lệ';
          return `${propertyName} ${reason}`;
        },
      },
    });
  };
}

/**
 * Motion tokens — durations + easings.
 *
 * Keep animations short (<200ms for micro, 300ms for transitions) per
 * Moysklad's utilitarian feel. No bouncy easings.
 */

export const durations = {
  instant: '0ms',
  fast: '100ms',
  normal: '150ms',
  slow: '250ms',
  slower: '400ms',
} as const;

export const easings = {
  standard: 'cubic-bezier(0.4, 0, 0.2, 1)',
  decelerate: 'cubic-bezier(0, 0, 0.2, 1)',
  accelerate: 'cubic-bezier(0.4, 0, 1, 1)',
} as const;

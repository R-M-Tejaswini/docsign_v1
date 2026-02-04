/**
 * PDF utility functions
 */

export const DEFAULT_PAGE_WIDTH = 612 // Points
export const DEFAULT_PAGE_HEIGHT = 792 // Points

export const pointsToInches = (points) => points / 72
export const inchesToPoints = (inches) => inches * 72
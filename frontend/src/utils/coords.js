/**
 * Convert percentage-based coordinates to pixel coordinates.
 * @param {number} pct - Percentage value (0-1)
 * @param {number} containerSize - Size of container in pixels
 * @returns {number} Pixel value
 */
export const pctToPx = (pct, containerSize) => {
  return pct * containerSize
}

/**
 * Convert pixel coordinates to percentage coordinates.
 * @param {number} px - Pixel value
 * @param {number} containerSize - Size of container in pixels
 * @returns {number} Percentage value (0-1)
 */
export const pxToPct = (px, containerSize) => {
  return Math.max(0, Math.min(1, px / containerSize))
}

/**
 * Round percentage to 4 decimal places for API submission.
 * @param {number} pct - Percentage value
 * @returns {number} Rounded percentage
 */
export const roundPct = (pct) => {
  return Math.round(pct * 10000) / 10000
}

/**
 * Convert field model from percentages to pixels for rendering.
 * @param {object} field - Field with x_pct, y_pct, width_pct, height_pct
 * @param {number} pageWidth - Page width in pixels
 * @param {number} pageHeight - Page height in pixels
 * @returns {object} Field with x, y, width, height in pixels
 */
export const fieldPctToPx = (field, pageWidth, pageHeight) => ({
  ...field,
  x: pctToPx(field.x_pct, pageWidth),
  y: pctToPx(field.y_pct, pageHeight),
  width: pctToPx(field.width_pct, pageWidth),
  height: pctToPx(field.height_pct, pageHeight),
})

/**
 * Convert field from pixels back to percentages after resize/move.
 * @param {object} field - Field with x, y, width, height in pixels
 * @param {number} pageWidth - Page width in pixels
 * @param {number} pageHeight - Page height in pixels
 * @returns {object} Field with x_pct, y_pct, width_pct, height_pct
 */
export const fieldPxToPct = (field, pageWidth, pageHeight) => ({
  ...field,
  x_pct: roundPct(pxToPct(field.x, pageWidth)),
  y_pct: roundPct(pxToPct(field.y, pageHeight)),
  width_pct: roundPct(pxToPct(field.width, pageWidth)),
  height_pct: roundPct(pxToPct(field.height, pageHeight)),
})
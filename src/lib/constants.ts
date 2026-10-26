/** Hard upper bound on accepted SVG size (PRD targets <2 s for files under 2 MB). */
export const MAX_FILE_BYTES = 10 * 1024 * 1024;

/** Largest accepted texture image. */
export const MAX_IMAGE_BYTES = 15 * 1024 * 1024;

export const isSvgFile = (file: File): boolean =>
  /\.svg$/i.test(file.name) || file.type === 'image/svg+xml';

/**
 * Code 128 (Subset B) Barcode SVG Generator
 * Universal 1D barcode generator for thermal and laser label printers.
 */

const CODE128_PATTERNS: string[] = [
  "212222", "222122", "222221", "121223", "121322", "131222", "122213", "122312", "132212", "221213", // 0-9
  "221312", "231212", "112232", "122132", "122231", "113222", "123122", "123221", "223211", "221132", // 10-19
  "221231", "213212", "223112", "312131", "311222", "321122", "321221", "312212", "322112", "322211", // 20-29
  "212123", "212321", "232121", "111323", "131123", "131321", "112313", "132113", "132311", "211313", // 30-39
  "231113", "231311", "112133", "112331", "132131", "113123", "113321", "133121", "313121", "211331", // 40-49
  "231131", "213113", "213311", "213131", "311123", "311321", "331121", "312113", "312311", "332111", // 50-59
  "314111", "221411", "431111", "111224", "111422", "121124", "121421", "141122", "141221", "112214", // 60-69
  "112412", "122114", "122411", "142112", "142211", "241211", "221114", "413111", "241112", "134111", // 70-79
  "111242", "121142", "121241", "114212", "124112", "124211", "411212", "421112", "421211", "212141", // 80-89
  "214121", "412121", "111143", "111341", "131141", "114113", "114311", "411113", "411311", "113141", // 90-99
  "114131", "311141", "411131", "211412", "211214", "211232", "2331112" // 100-106 (106 is STOP pattern)
];

const START_CODE_B = 104;
const STOP_CODE = 106;

/**
 * Encodes an ASCII string into Code 128B bar widths.
 */
export function encodeCode128(text: string): number[] {
  const codes: number[] = [START_CODE_B];
  let checksum = START_CODE_B;

  for (let i = 0; i < text.length; i++) {
    const charCode = text.charCodeAt(i);
    const value = charCode - 32; // Code 128B mapping
    if (value >= 0 && value <= 95) {
      codes.push(value);
      checksum += value * (i + 1);
    }
  }

  const checkDigit = checksum % 103;
  codes.push(checkDigit);
  codes.push(STOP_CODE);

  // Convert codes to bar/space width sequence
  const widths: number[] = [];
  for (const code of codes) {
    const pattern = CODE128_PATTERNS[code];
    if (pattern) {
      for (let j = 0; j < pattern.length; j++) {
        widths.push(parseInt(pattern[j], 10));
      }
    }
  }
  return widths;
}

/**
 * Generates an SVG path data for barcode bars.
 */
export function generateBarcodeSvgPaths(text: string, height: number = 50, barWidth: number = 2): {
  svgPaths: string;
  totalWidth: number;
} {
  const widths = encodeCode128(text);
  let currentX = 10; // Quiet zone
  const paths: string[] = [];

  for (let i = 0; i < widths.length; i++) {
    const w = widths[i] * barWidth;
    const isBar = i % 2 === 0;
    if (isBar) {
      paths.push(`M${currentX},0 L${currentX + w},0 L${currentX + w},${height} L${currentX},${height} Z`);
    }
    currentX += w;
  }

  currentX += 10; // Quiet zone

  return {
    svgPaths: paths.join(" "),
    totalWidth: currentX,
  };
}

/**
 * Helper to generate a standardized in-store EAN/Code128 barcode for a product.
 * Format: 894 (BD FMCG/Retail prefix) + 8-digit unique product number + check digit
 */
export function generateInStoreBarcode(sku?: string, productId?: string): string {
  const prefix = "894";
  let hash = 0;
  const seed = (sku || productId || Date.now().toString()).toUpperCase();
  for (let i = 0; i < seed.length; i++) {
    hash = (hash * 31 + seed.charCodeAt(i)) >>> 0;
  }
  const mid = String(hash % 100000000).padStart(8, "0");
  const base = `${prefix}${mid}`;
  
  // Calculate EAN-13 check digit
  let sum = 0;
  for (let i = 0; i < 11; i++) {
    const digit = parseInt(base[i], 10) || 0;
    sum += i % 2 === 0 ? digit : digit * 3;
  }
  const checkDigit = (10 - (sum % 10)) % 10;
  return `${base}${checkDigit}`;
}

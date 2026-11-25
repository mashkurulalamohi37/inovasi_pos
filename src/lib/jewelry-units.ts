/**
 * Traditional Bangladeshi Jewelry Weight Unit Conversion Library
 * 
 * Standards in Bangladesh Jeweller's Association (BAJUS):
 * 1 Bhori (ভরি / তোলা) = 11.664 grams
 * 1 Bhori = 16 Ana (আনা)
 * 1 Ana = 6 Roti (রতি) => 1 Bhori = 96 Roti
 * 1 Roti = 10 Points (পয়েন্ট) => 1 Bhori = 960 Points
 * 
 * 1 Ana = 11.664 / 16 = 0.729 grams
 * 1 Roti = 11.664 / 96 = 0.1215 grams
 * 1 Point = 11.664 / 960 = 0.01215 grams
 */

export const GRAMS_PER_BHORI = 11.664;
export const GRAMS_PER_ANA = 0.729;
export const GRAMS_PER_ROTI = 0.1215;
export const GRAMS_PER_POINT = 0.01215;

export type BhoriBreakdown = {
  grams: number;
  totalBhori: number;
  bhori: number;
  ana: number;
  roti: number;
  point: number;
  displayEn: string;
  displayBn: string;
  shortEn: string;
  shortBn: string;
};

const BN_DIGITS = ["০", "১", "২", "৩", "৪", "৫", "৬", "৭", "৮", "৯"];

export function toBanglaNumber(num: number | string): string {
  return String(num).replace(/[0-9]/g, (d) => BN_DIGITS[parseInt(d, 10)] || d);
}

export function gramsToBhori(grams: number): BhoriBreakdown {
  if (!grams || grams <= 0) {
    return {
      grams: 0,
      totalBhori: 0,
      bhori: 0,
      ana: 0,
      roti: 0,
      point: 0,
      displayEn: "0 Bhori",
      displayBn: "০ ভরি",
      shortEn: "0 Bh",
      shortBn: "০ ভরি",
    };
  }

  const totalBhori = grams / GRAMS_PER_BHORI;
  const bhori = Math.floor(totalBhori);
  const remBhori = totalBhori - bhori;

  const totalAna = remBhori * 16.0;
  const ana = Math.floor(totalAna);
  const remAna = totalAna - ana;

  const totalRoti = remAna * 6.0;
  const roti = Math.floor(totalRoti);
  const remRoti = totalRoti - roti;

  const point = Math.round(remRoti * 10.0 * 10) / 10;

  const partsEn: string[] = [];
  const partsBn: string[] = [];

  if (bhori > 0) {
    partsEn.push(`${bhori} Bhori`);
    partsBn.push(`${toBanglaNumber(bhori)} ভরি`);
  }
  if (ana > 0) {
    partsEn.push(`${ana} Ana`);
    partsBn.push(`${toBanglaNumber(ana)} আনা`);
  }
  if (roti > 0) {
    partsEn.push(`${roti} Roti`);
    partsBn.push(`${toBanglaNumber(roti)} রতি`);
  }
  if (point > 0) {
    partsEn.push(`${point} Point`);
    partsBn.push(`${toBanglaNumber(point)} পয়েন্ট`);
  }

  const displayEn = partsEn.length > 0 ? partsEn.join(" ") : `${totalBhori.toFixed(4)} Bhori`;
  const displayBn = partsBn.length > 0 ? partsBn.join(" ") : `${toBanglaNumber(totalBhori.toFixed(4))} ভরি`;

  return {
    grams: Math.round(grams * 10000) / 10000,
    totalBhori: Math.round(totalBhori * 10000) / 10000,
    bhori,
    ana,
    roti,
    point,
    displayEn,
    displayBn,
    shortEn: `${totalBhori.toFixed(2)} Bh`,
    shortBn: `${toBanglaNumber(totalBhori.toFixed(2))} ভরি`,
  };
}

export function bhoriToGrams(
  bhori = 0,
  ana = 0,
  roti = 0,
  point = 0
): number {
  const totalBhori = bhori + ana / 16.0 + roti / 96.0 + point / 960.0;
  return Math.round(totalBhori * GRAMS_PER_BHORI * 10000) / 10000;
}

export function formatGramsAndBhori(grams: number, lang: "en" | "bn" = "en"): string {
  const b = gramsToBhori(grams);
  if (lang === "bn") {
    return `${toBanglaNumber(grams.toFixed(3))} গ্রাম (${b.displayBn})`;
  }
  return `${grams.toFixed(3)}g (${b.displayEn})`;
}

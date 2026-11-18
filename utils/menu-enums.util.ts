export const VALID_CUISINES = [
  "SOUTH_INDIAN",
  "PUNJABI",
  "NORTH_INDIAN",
  "MUGHALAI",
  "BENGALI",
  "GOAN",
  "TAMIL",
  "ANDHRA",
  "KERALA",
  "INDIAN_CHINESE",
  "CHINESE",
  "AWADHI",
  "MALAYSIAN",
  "MAHARASHTRIAN",
  "TIBETAN",
  "SRI_LANKAN",
  "SIKKIMESE",
  "TASTE_OF_BIHAR",
  "ASSAMESE",
  "BAKERY_CONFECTIONERY",
  "CONTINENTAL",
  "ITALIAN",
  "MEXICAN",
  "LEBANESE",
  "MONGOLIAN",
  "MALABARI",
  "HYDERABADI",
  "ODIYA",
  "MARATHI",
  "GUJRATI",
  "RAJASTHANI",
  "AMERICAN",
] as const;

export type ValidCuisine = (typeof VALID_CUISINES)[number];

export const VALID_FOOD_TYPES = [
  "SNACKS",
  "BREAKFAST",
  "STARTERS",
  "MAINS",
  "MAINS_GRAVY",
  "BREADS",
  "THALI",
  "COMBO",
  "DESSERTS",
  "SOUP",
  "BEVERAGE",
] as const;

export type ValidFoodType = (typeof VALID_FOOD_TYPES)[number];

export const VALID_ITEM_TYPES = ["VEG", "NON_VEG", "EGG"] as const;
export type ValidItemType = (typeof VALID_ITEM_TYPES)[number];

/**
 * Normalizes input cuisine string to a valid IRCTC cuisine enum value.
 * Defaults to "NORTH_INDIAN" if invalid or missing.
 */
export function normalizeCuisine(cuisine?: string | null): ValidCuisine {
  if (!cuisine) return "NORTH_INDIAN";
  const upper = cuisine.trim().toUpperCase().replace(/\s+/g, "_");
  if ((VALID_CUISINES as readonly string[]).includes(upper)) {
    return upper as ValidCuisine;
  }
  return "NORTH_INDIAN";
}
export function normalizeFoodType(foodType?: string | null): ValidFoodType {
  if (!foodType) return "MAINS";
  const upper = foodType.trim().toUpperCase().replace(/\s+/g, "_");
  if ((VALID_FOOD_TYPES as readonly string[]).includes(upper)) {
    return upper as ValidFoodType;
  }
  return "MAINS";
}

export function normalizeItemType(
  isVegOrItemType?: number | boolean | string | null
): ValidItemType {
  if (isVegOrItemType === "EGG" || isVegOrItemType === "egg") return "EGG";
  if (
    isVegOrItemType === "NON_VEG" ||
    isVegOrItemType === "non_veg" ||
    isVegOrItemType === 0 ||
    isVegOrItemType === false ||
    isVegOrItemType === "0" ||
    isVegOrItemType === "false"
  ) {
    return "NON_VEG";
  }
  return "VEG";
}

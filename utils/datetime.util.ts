import { format, parse, isValid, startOfDay, endOfDay, subDays, addDays } from "date-fns";
import { formatInTimeZone, toZonedTime, fromZonedTime } from "date-fns-tz";

const IST_TIMEZONE = "Asia/Kolkata";

/**
 * Parses a V1 Legacy date string (e.g., "YYYY-MM-DD HH:mm IST" or "MM-DD-YYYY HH:mm IST")
 * into a UTC Date object (an INSTANT).
 */
export const parseLegacyV1Date = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    const cleanStr = dateStr.replace(" IST", "").trim();

    // Check YYYY-MM-DD HH:mm
    let parsed = parse(cleanStr, "yyyy-MM-dd HH:mm", new Date());
    if (!isValid(parsed)) {
        // Fallback: Check MM-DD-YYYY HH:mm
        parsed = parse(cleanStr, "MM-dd-yyyy HH:mm", new Date());
    }

    if (!isValid(parsed)) {
        // Ultimate fallback for ISO-like or naive formats
        parsed = new Date(cleanStr);
        if (isNaN(parsed.getTime())) return null;
    }

    // Convert the parsed wall-clock time (which is conceptually in IST) to a UTC instant
    return fromZonedTime(parsed, IST_TIMEZONE);
};

/**
 * Formats a Date object (UTC INSTANT) into the V1 Legacy string format ("YYYY-MM-DD HH:mm IST")
 */
export const formatLegacyV1Date = (date: Date | string | null | undefined): string | null => {
    if (!date) return null;
    const dateObj = typeof date === "string" ? new Date(date) : date;
    if (isNaN(dateObj.getTime())) return null;

    // Output: YYYY-MM-DD HH:mm IST
    return formatInTimeZone(dateObj, IST_TIMEZONE, "yyyy-MM-dd HH:mm") + " IST";
};

/**
 * Helper to generate business-day boundaries (IST)
 * Useful for crons and settlements.
 */
export const getBusinessDayBoundaries = (date: Date = new Date(), offsetDays: number = 0) => {
    let targetDate = date;
    if (offsetDays !== 0) {
        targetDate = offsetDays > 0 ? addDays(date, offsetDays) : subDays(date, Math.abs(offsetDays));
    }

    // Convert current instant to the "wall clock" time in IST
    const zonedTime = toZonedTime(targetDate, IST_TIMEZONE);
    
    // Find start and end of that IST day
    const startOfIstDay = startOfDay(zonedTime);
    const endOfIstDay = endOfDay(zonedTime);

    // Convert those boundary wall-clock times back to UTC instants
    return {
        startDate: formatInTimeZone(targetDate, IST_TIMEZONE, "yyyy-MM-dd"), // DATE_ONLY representation
        startInstant: fromZonedTime(startOfIstDay, IST_TIMEZONE),
        endInstant: fromZonedTime(endOfIstDay, IST_TIMEZONE)
    };
};

/**
 * Returns the current date strictly formatted in IST timezone (YYYY-MM-DD)
 * Ideal for DATE_ONLY PostgreSQL columns like vendor_wallet.transaction_date.
 */
export const getBusinessDateString = (date: Date = new Date()): string => {
    return formatInTimeZone(date, IST_TIMEZONE, "yyyy-MM-dd");
};

/**
 * Cleanly parses standard ISO 8601 strings (V3 format) to Date objects.
 */
export const parseV3IsoDate = (dateStr: string | null | undefined): Date | null => {
    if (!dateStr) return null;
    const parsed = new Date(dateStr);
    return isNaN(parsed.getTime()) ? null : parsed;
};

/**
 * Formats a JS Date object safely into a YYYY-MM-DDTHH:mm:ss.SSS local string (IST).
 * Prevents toISOString() from shifting local dates back to UTC.
 */
export const formatForPostgresLocal = (date: Date): string => {
    return formatInTimeZone(date, IST_TIMEZONE, "yyyy-MM-dd'T'HH:mm:ss.SSS");
};

/**
 * Parses raw delivery_date strings from DB (assumed UTC) and formats them cleanly into IST for CSV/UI.
 */
export const formatDeliveryDateForCsv = (dateStr: string | null | undefined): string => {
    if (!dateStr) return "";
    const dStr = String(dateStr);
    const parseableStr = (dStr.includes("Z") || dStr.includes("UTC") || dStr.includes("GMT") || dStr.includes("+")) 
      ? dStr 
      : `${dStr} UTC`;
    const d = new Date(parseableStr);
    if (!isNaN(d.getTime())) {
        return formatInTimeZone(d, IST_TIMEZONE, "dd/MM/yyyy, hh:mm:ss a");
    }
    return dStr;
};

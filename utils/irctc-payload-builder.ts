


export const determineMealType = (outlet: any): "PURE_VEG" | "VEG_AND_NON_VEG" => {
    if (
        outlet.veg_only === 1 ||
        outlet.veg_only === true ||
        String(outlet.veg_only).toLowerCase() === "true"
    ) {
        return "PURE_VEG";
    }

    const tags = String(outlet.tags || "").toUpperCase();
    const tagsList = tags.split(",").map((t: string) => t.trim());

    const hasNonVeg = tagsList.some(
        (t) => t === "NONVEG" || t === "NON_VEG" || t === "NON-VEG" || t === "NON VEG"
    );
    const hasVeg = tagsList.some(
        (t) => t === "VEG" || t === "PURE_VEG" || t === "PURE-VEG"
    );

    if (hasNonVeg) {
        return "VEG_AND_NON_VEG";
    }

    if (hasVeg) {
        return "PURE_VEG";
    }

    return "VEG_AND_NON_VEG";
};

export const formatFssaiDate = (dateStr: any): string => {
    if (!dateStr) throw new Error('FSSAI expiry is required before provider sync.');
    try {
        const value=String(dateStr).trim();
        if(!/^\d{4}-\d{2}-\d{2}(?:T.*)?$/.test(value))throw new Error('Invalid FSSAI expiry.');
        const d = new Date(value);
        if (isNaN(d.getTime())) throw new Error('Invalid FSSAI expiry.');
        if(d.toISOString().slice(0,10)!==value.slice(0,10))throw new Error('Invalid FSSAI expiry.');
        if(d.toISOString().slice(0,10)<new Date().toISOString().slice(0,10))throw new Error('Expired FSSAI license.');
        return d.toISOString().split("T")[0];
    } catch (e) {
        throw new Error('Enter a valid FSSAI expiry before provider sync.');
    }
};

export const buildOutletIRCTCId = (outletId: any): string => {
    return String(outletId)
        .replace(/[^a-zA-Z0-9]/g, "")
        .substring(0, 15);
};

export const formatTime = (timeStr: any, defaultTime: string): string => {
    if (!timeStr) return defaultTime;
    const match = String(timeStr).match(/\d{2}:\d{2}(:\d{2})?/);
    let time = match ? match[0] : defaultTime;
    // ensure HH:mm:ss format for robust IRCTC integration
    if (time && time.length === 5) {
        time = `${time}:00`;
    }
    return time;
};

export const buildV3Payload = (outlet: any): any => {
    const outletIRCTCId = buildOutletIRCTCId(outlet.outlet_id);

    // Resolve relationship manager (RL) fields — use per-outlet DB values if set,
    // fall back to the configured OLF defaults.
    const DEFAULT_RL_EMAIL = process.env.IRCTC_DEFAULT_RL_EMAIL || '';
    const DEFAULT_RL_PHONE = process.env.IRCTC_DEFAULT_RL_PHONE || '';
    const DEFAULT_RL_NAME  = process.env.IRCTC_DEFAULT_RL_NAME  || '';

    const rlEmail = (outlet.rlemail && String(outlet.rlemail).trim() && String(outlet.rlemail).trim() !== "null")
        ? String(outlet.rlemail).trim()
        : DEFAULT_RL_EMAIL;
    const rlPhone = (outlet.rlphone && String(outlet.rlphone).trim() && String(outlet.rlphone).trim() !== "null")
        ? String(outlet.rlphone).trim()
        : DEFAULT_RL_PHONE;
    const rlName = (outlet.rlname && String(outlet.rlname).trim() && String(outlet.rlname).trim() !== "null")
        ? String(outlet.rlname).trim()
        : DEFAULT_RL_NAME;

    if(!outletIRCTCId||!outlet.outlet_name||!/^\d{14}$/.test(String(outlet.fssai||'')))throw new Error('Outlet ID, name and a valid FSSAI number are required.');
    if(!rlName||!/^\d{10}$/.test(rlPhone)||!/^\S+@\S+\.\S+$/.test(rlEmail))throw new Error('Configure the outlet relationship manager contact before provider sync.');
    if(!outlet.address||!/^https:\/\//.test(String(outlet.logo_image||'')))throw new Error('Save the outlet address and a valid HTTPS logo URL before provider sync.');
    if(!outlet.opening_time||!outlet.closing_time)throw new Error('Save outlet opening and closing times before provider sync.');
    const payload: any = {
        id: outletIRCTCId,
        name: (outlet.outlet_name || "").replace(/[^a-zA-Z0-9 ]/g, "").trim(),
        logoImage: outlet.logo_image,
        minOrderAmount: Number(outlet.min_order_amount || 0),
        bookingCutoff: Math.min(
            105,
            Math.max(15, Number(outlet.order_timing || 60)),
        ),
        prepaid: String(
            outlet.prepaid === true || outlet.prepaid === "true"
                ? "true"
                : "false",
        ),
        gstNo:
            outlet.gst &&
            String(outlet.gst).trim() !== "" &&
            String(outlet.gst).trim().toLowerCase() !== "null"
                ? String(outlet.gst).trim()
                : null,
        fssaiNo: String(outlet.fssai || ""),
        fssaiValidUpto: formatFssaiDate(outlet.fssai_valid),
        address: String(outlet.address).substring(0, 255),
        mealType: determineMealType(outlet),
        closingPeriod: (() => {
            console.log("Raw closing_period:", outlet.closing_period);
            if (!outlet.closing_period) return null;
            try {
                const periods = typeof outlet.closing_period === 'string'
                    ? JSON.parse(outlet.closing_period)
                    : outlet.closing_period;
                console.log("Parsed periods:", periods);
                const periodsArray = Array.isArray(periods) ? periods : [periods];
                
                const irctcPeriods = periodsArray
                    .filter((p: any) => p && p.closedFrom && p.closedTo)
                    .map((p: any) => ({
                        from: p.closedFrom.replace('T', ' ').substring(0, 16),
                        to: p.closedTo.replace('T', ' ').substring(0, 16)
                    }));
                
                console.log("IRCTC mapped periods:", irctcPeriods);
                return irctcPeriods.length > 0 ? irctcPeriods : null;
            } catch (err) {
                console.error("Error parsing closing_period:", err);
                return null;
            }
        })(),
        weeklyClosed: (() => {
            if (!outlet.weeklyclosed) return null;
            try {
                let arr = [];
                if (typeof outlet.weeklyclosed === 'string') {
                    arr = outlet.weeklyclosed.startsWith('[') ? JSON.parse(outlet.weeklyclosed) : outlet.weeklyclosed.split(',');
                } else if (Array.isArray(outlet.weeklyclosed)) {
                    arr = outlet.weeklyclosed;
                }
                const validDays = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT'];
                arr = arr
                    .map((d: any) => String(d).trim().toUpperCase())
                    .filter((d: string) => validDays.includes(d));
                return arr.length > 0 ? arr : null;
            } catch (err) {
                return null;
            }
        })(),
        contact: {
            email: rlEmail,
            mobile: rlPhone,
        },
        schedules: [
            {
                startTime: formatTime(outlet.opening_time, "06:00"),
                endTime: formatTime(outlet.closing_time, "23:00"),
            },
        ],
    };

    let promotionsArray = outlet.promotions;
    if (typeof promotionsArray === "string") {
        try {
            promotionsArray = JSON.parse(promotionsArray);
        } catch (e) {}
    }
    if (
        promotionsArray &&
        typeof promotionsArray === "object" &&
        promotionsArray.promotions
    ) {
        promotionsArray = promotionsArray.promotions;
    }
    if (Array.isArray(promotionsArray) && promotionsArray.length > 0) {
        payload.promotions = promotionsArray;
    }

    let chargesArray = outlet.charges || outlet.delivery_charges;
    if (typeof chargesArray === "string") {
        try {
            chargesArray = JSON.parse(chargesArray);
        } catch (e) {}
    }
    if (
        chargesArray &&
        typeof chargesArray === "object" &&
        chargesArray.charges
    ) {
        chargesArray = chargesArray.charges;
    }
    if (Array.isArray(chargesArray) && chargesArray.length > 0) {
        payload.charges = chargesArray;
    }

    // Safely parse closingPeriod — map DB format {closedFrom, closedTo} → IRCTC format {from, to}
    if (outlet.closing_period) {
        try {
            let parsedClosingPeriod = typeof outlet.closing_period === 'string'
                ? JSON.parse(outlet.closing_period)
                : outlet.closing_period;

            const toMapped = (cp: any) => ({
                from: cp.from ?? cp.closedFrom ?? null,
                to:   cp.to   ?? cp.closedTo   ?? null,
            });

            let mappedPeriods: any[] = [];
            if (Array.isArray(parsedClosingPeriod)) {
                mappedPeriods = parsedClosingPeriod
                    .map(toMapped)
                    .filter(cp => cp.from && cp.to);
            } else if (parsedClosingPeriod) {
                const m = toMapped(parsedClosingPeriod);
                if (m.from && m.to) mappedPeriods = [m];
            }

            if (mappedPeriods.length > 0) {
                payload.closingPeriod = mappedPeriods;
            }
        } catch (e) {
            console.warn(`[V3 Payload Builder] Failed to parse closing_period for outlet ${outlet.outlet_id}`);
        }
    }

    // Safely parse weeklyClosed if available
    if (outlet.weekly_closed) {
        try {
            payload.weeklyClosed = typeof outlet.weekly_closed === 'string'
                ? JSON.parse(outlet.weekly_closed)
                : outlet.weekly_closed;
        } catch (e) {
            console.warn(`[V3 Payload Builder] Failed to parse weekly_closed for outlet ${outlet.outlet_id}`);
        }
    }

    return payload;
};

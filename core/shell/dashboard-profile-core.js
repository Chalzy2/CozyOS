/**
 * CozyOS — Dashboard Profile Core
 * File Reference: core/shell/dashboard-profile-core.js
 * Milestone: User Profile Phase 1 (Profile UI + basic fields)
 *
 * CLASSIFICATION: COMPOSED, new, pure logic (no DOM, no storage, no
 * network), Node-testable — same "-core.js" convention as
 * dashboard-navigation-core.js, dashboard-community-summary-core.js
 * and dashboard-settings-admin-boundary-core.js. This is NOT a profile
 * store and NOT a second identity system: the real record stays in
 * window.CozyOS.IdentityEngine (getProfile()/updateProfile()), and
 * core/shell/user-dashboard.js renders it. This file only holds the
 * pure decisions that surface needs so they can be unit-tested without
 * a browser: what to show, what is valid, what actually changed.
 *
 * WHY A COUNTRY LIST LIVES HERE (Rule 0/1 — reuse before create)
 *   Audited before writing: no general country registry exists in this
 *   repository. The only candidates were
 *   (a) core/modules/intelligence/language-packs/cozy-language-country-
 *       metadata.js — a 12-entry table that its own header restricts to
 *       "presentation metadata for a LANGUAGE's recorded evidence of
 *       use", and which does not export its table, and
 *   (b) core/modules/ChurchOS/church-attendance-geography.js — a
 *       private East-Africa comparison list for analytics.
 *   Neither is a country picker, and reusing either as one would
 *   misrepresent what it is. So this file carries the ISO 3166-1
 *   officially-assigned list (249 entries) as static data. Kenya is one
 *   entry among many — nothing here defaults to, sorts to the top for,
 *   or assumes any country.
 *
 * STORAGE CONVENTION THIS FILE ADAPTS TO
 *   IdentityEngine already stores `country` as the country NAME string
 *   (register()'s optional.country; church-attendance-geography.js
 *   compares it against names such as "Tanzania"), and it HTML-escapes
 *   text fields when it stores them (register() does the same to
 *   firstName/lastName). So: the country picker's option VALUE is the
 *   ISO alpha-2 code (unambiguous), but what is handed to
 *   IdentityEngine is the NAME; and every stored string is entity-
 *   decoded here (decodeStoredText) before it is shown in an input, so
 *   "O&#39;Brien" is edited as "O'Brien" and never double-escaped.
 *
 * NAME MODEL
 *   The existing user record has firstName + lastName (register()), not
 *   one "full name" field. This file maps between them without adding a
 *   third field: full name = firstName + " " + lastName; on save the
 *   name parts are ONLY rewritten if the person actually changed the
 *   full name (so a stored firstName "Mary Anne" is never silently
 *   re-split into "Mary" / "Anne Kamau" by a save that touched only the
 *   city). When it is rewritten: first word -> firstName, the rest ->
 *   lastName (a single word -> firstName, lastName "").
 *
 * WHAT THIS FILE NEVER DOES
 *   Never reads GPS/IP/locale to guess a country or city. Never touches
 *   username, email, phone, roles, password material, or any
 *   authentication field. Never decides where a picture is stored — the
 *   picture path here is validation-only, and
 *   getPicturePersistenceStatus() says honestly that persistence is not
 *   built yet.
 */
(function (root) {
    "use strict";

    const VERSION = "1.0.0";

    const LIMITS = Object.freeze({ fullName: 100, city: 80 });

    /** Sentinel <option> value meaning "keep the stored country exactly as it is" (used when a stored value is not in the ISO list). */
    const KEEP_CURRENT_COUNTRY = "__current__";

    // Allow-list only. SVG is deliberately absent (scriptable format),
    // as are GIF/BMP/HEIC (no reliable cross-browser preview).
    const PICTURE_ALLOWED_TYPES = Object.freeze(["image/jpeg", "image/png", "image/webp"]);
    const PICTURE_MAX_BYTES = 5 * 1024 * 1024;

    // ISO 3166-1 officially assigned entries, sorted by English name.
    // [alpha-2 code, name]. Names are plain text with no & < > " so they
    // survive IdentityEngine's HTML-escape-on-store round trip; the one
    // apostrophe (Cote d'Ivoire) is handled by decodeStoredText().
    const COUNTRY_TABLE = Object.freeze([
        ["AF", "Afghanistan"],
        ["AX", "Åland Islands"],
        ["AL", "Albania"],
        ["DZ", "Algeria"],
        ["AS", "American Samoa"],
        ["AD", "Andorra"],
        ["AO", "Angola"],
        ["AI", "Anguilla"],
        ["AQ", "Antarctica"],
        ["AG", "Antigua and Barbuda"],
        ["AR", "Argentina"],
        ["AM", "Armenia"],
        ["AW", "Aruba"],
        ["AU", "Australia"],
        ["AT", "Austria"],
        ["AZ", "Azerbaijan"],
        ["BS", "Bahamas"],
        ["BH", "Bahrain"],
        ["BD", "Bangladesh"],
        ["BB", "Barbados"],
        ["BY", "Belarus"],
        ["BE", "Belgium"],
        ["BZ", "Belize"],
        ["BJ", "Benin"],
        ["BM", "Bermuda"],
        ["BT", "Bhutan"],
        ["BO", "Bolivia"],
        ["BA", "Bosnia and Herzegovina"],
        ["BW", "Botswana"],
        ["BV", "Bouvet Island"],
        ["BR", "Brazil"],
        ["IO", "British Indian Ocean Territory"],
        ["VG", "British Virgin Islands"],
        ["BN", "Brunei"],
        ["BG", "Bulgaria"],
        ["BF", "Burkina Faso"],
        ["BI", "Burundi"],
        ["KH", "Cambodia"],
        ["CM", "Cameroon"],
        ["CA", "Canada"],
        ["CV", "Cape Verde"],
        ["BQ", "Caribbean Netherlands"],
        ["KY", "Cayman Islands"],
        ["CF", "Central African Republic"],
        ["TD", "Chad"],
        ["CL", "Chile"],
        ["CN", "China"],
        ["CX", "Christmas Island"],
        ["CC", "Cocos (Keeling) Islands"],
        ["CO", "Colombia"],
        ["KM", "Comoros"],
        ["CK", "Cook Islands"],
        ["CR", "Costa Rica"],
        ["CI", "Côte d'Ivoire"],
        ["HR", "Croatia"],
        ["CU", "Cuba"],
        ["CW", "Curaçao"],
        ["CY", "Cyprus"],
        ["CZ", "Czechia"],
        ["CD", "Democratic Republic of the Congo"],
        ["DK", "Denmark"],
        ["DJ", "Djibouti"],
        ["DM", "Dominica"],
        ["DO", "Dominican Republic"],
        ["EC", "Ecuador"],
        ["EG", "Egypt"],
        ["SV", "El Salvador"],
        ["GQ", "Equatorial Guinea"],
        ["ER", "Eritrea"],
        ["EE", "Estonia"],
        ["SZ", "Eswatini"],
        ["ET", "Ethiopia"],
        ["FK", "Falkland Islands"],
        ["FO", "Faroe Islands"],
        ["FJ", "Fiji"],
        ["FI", "Finland"],
        ["FR", "France"],
        ["GF", "French Guiana"],
        ["PF", "French Polynesia"],
        ["TF", "French Southern Territories"],
        ["GA", "Gabon"],
        ["GM", "Gambia"],
        ["GE", "Georgia"],
        ["DE", "Germany"],
        ["GH", "Ghana"],
        ["GI", "Gibraltar"],
        ["GR", "Greece"],
        ["GL", "Greenland"],
        ["GD", "Grenada"],
        ["GP", "Guadeloupe"],
        ["GU", "Guam"],
        ["GT", "Guatemala"],
        ["GG", "Guernsey"],
        ["GN", "Guinea"],
        ["GW", "Guinea-Bissau"],
        ["GY", "Guyana"],
        ["HT", "Haiti"],
        ["HM", "Heard and McDonald Islands"],
        ["HN", "Honduras"],
        ["HK", "Hong Kong"],
        ["HU", "Hungary"],
        ["IS", "Iceland"],
        ["IN", "India"],
        ["ID", "Indonesia"],
        ["IR", "Iran"],
        ["IQ", "Iraq"],
        ["IE", "Ireland"],
        ["IM", "Isle of Man"],
        ["IL", "Israel"],
        ["IT", "Italy"],
        ["JM", "Jamaica"],
        ["JP", "Japan"],
        ["JE", "Jersey"],
        ["JO", "Jordan"],
        ["KZ", "Kazakhstan"],
        ["KE", "Kenya"],
        ["KI", "Kiribati"],
        ["KW", "Kuwait"],
        ["KG", "Kyrgyzstan"],
        ["LA", "Laos"],
        ["LV", "Latvia"],
        ["LB", "Lebanon"],
        ["LS", "Lesotho"],
        ["LR", "Liberia"],
        ["LY", "Libya"],
        ["LI", "Liechtenstein"],
        ["LT", "Lithuania"],
        ["LU", "Luxembourg"],
        ["MO", "Macao"],
        ["MG", "Madagascar"],
        ["MW", "Malawi"],
        ["MY", "Malaysia"],
        ["MV", "Maldives"],
        ["ML", "Mali"],
        ["MT", "Malta"],
        ["MH", "Marshall Islands"],
        ["MQ", "Martinique"],
        ["MR", "Mauritania"],
        ["MU", "Mauritius"],
        ["YT", "Mayotte"],
        ["MX", "Mexico"],
        ["FM", "Micronesia"],
        ["MD", "Moldova"],
        ["MC", "Monaco"],
        ["MN", "Mongolia"],
        ["ME", "Montenegro"],
        ["MS", "Montserrat"],
        ["MA", "Morocco"],
        ["MZ", "Mozambique"],
        ["MM", "Myanmar"],
        ["NA", "Namibia"],
        ["NR", "Nauru"],
        ["NP", "Nepal"],
        ["NL", "Netherlands"],
        ["NC", "New Caledonia"],
        ["NZ", "New Zealand"],
        ["NI", "Nicaragua"],
        ["NE", "Niger"],
        ["NG", "Nigeria"],
        ["NU", "Niue"],
        ["NF", "Norfolk Island"],
        ["KP", "North Korea"],
        ["MK", "North Macedonia"],
        ["MP", "Northern Mariana Islands"],
        ["NO", "Norway"],
        ["OM", "Oman"],
        ["PK", "Pakistan"],
        ["PW", "Palau"],
        ["PS", "Palestinian Territories"],
        ["PA", "Panama"],
        ["PG", "Papua New Guinea"],
        ["PY", "Paraguay"],
        ["PE", "Peru"],
        ["PH", "Philippines"],
        ["PN", "Pitcairn Islands"],
        ["PL", "Poland"],
        ["PT", "Portugal"],
        ["PR", "Puerto Rico"],
        ["QA", "Qatar"],
        ["CG", "Republic of the Congo"],
        ["RE", "Réunion"],
        ["RO", "Romania"],
        ["RU", "Russia"],
        ["RW", "Rwanda"],
        ["WS", "Samoa"],
        ["SM", "San Marino"],
        ["ST", "São Tomé and Príncipe"],
        ["SA", "Saudi Arabia"],
        ["SN", "Senegal"],
        ["RS", "Serbia"],
        ["SC", "Seychelles"],
        ["SL", "Sierra Leone"],
        ["SG", "Singapore"],
        ["SX", "Sint Maarten"],
        ["SK", "Slovakia"],
        ["SI", "Slovenia"],
        ["SB", "Solomon Islands"],
        ["SO", "Somalia"],
        ["ZA", "South Africa"],
        ["GS", "South Georgia and South Sandwich Islands"],
        ["KR", "South Korea"],
        ["SS", "South Sudan"],
        ["ES", "Spain"],
        ["LK", "Sri Lanka"],
        ["BL", "St. Barthélemy"],
        ["SH", "St. Helena"],
        ["KN", "St. Kitts and Nevis"],
        ["LC", "St. Lucia"],
        ["MF", "St. Martin"],
        ["PM", "St. Pierre and Miquelon"],
        ["VC", "St. Vincent and Grenadines"],
        ["SD", "Sudan"],
        ["SR", "Suriname"],
        ["SJ", "Svalbard and Jan Mayen"],
        ["SE", "Sweden"],
        ["CH", "Switzerland"],
        ["SY", "Syria"],
        ["TW", "Taiwan"],
        ["TJ", "Tajikistan"],
        ["TZ", "Tanzania"],
        ["TH", "Thailand"],
        ["TL", "Timor-Leste"],
        ["TG", "Togo"],
        ["TK", "Tokelau"],
        ["TO", "Tonga"],
        ["TT", "Trinidad and Tobago"],
        ["TN", "Tunisia"],
        ["TR", "Türkiye"],
        ["TM", "Turkmenistan"],
        ["TC", "Turks and Caicos Islands"],
        ["TV", "Tuvalu"],
        ["UM", "U.S. Outlying Islands"],
        ["VI", "U.S. Virgin Islands"],
        ["UG", "Uganda"],
        ["UA", "Ukraine"],
        ["AE", "United Arab Emirates"],
        ["GB", "United Kingdom"],
        ["US", "United States"],
        ["UY", "Uruguay"],
        ["UZ", "Uzbekistan"],
        ["VU", "Vanuatu"],
        ["VA", "Vatican City"],
        ["VE", "Venezuela"],
        ["VN", "Vietnam"],
        ["WF", "Wallis and Futuna"],
        ["EH", "Western Sahara"],
        ["YE", "Yemen"],
        ["ZM", "Zambia"],
        ["ZW", "Zimbabwe"]
    ].map((row) => Object.freeze({ code: row[0], name: row[1] })));

    const BY_CODE = new Map(COUNTRY_TABLE.map((c) => [c.code, c]));
    const BY_NAME = new Map(COUNTRY_TABLE.map((c) => [c.name.toLowerCase(), c]));

    const ENTITY_MAP = { "&amp;": "&", "&lt;": "<", "&gt;": ">", "&quot;": "\"", "&#39;": "'" };

    /** decodeStoredText(s) — reverses IdentityEngine's #escapeHtml() (single pass, so "&amp;lt;" becomes "&lt;", never "<"). */
    function decodeStoredText(s) {
        if (s === null || s === undefined) return "";
        return String(s).replace(/&(?:amp|lt|gt|quot|#39);/g, (m) => ENTITY_MAP[m]);
    }

    /** normalizeText(s) — strips control characters, collapses whitespace runs, trims. Never truncates (length is validated, not silently cut). */
    function normalizeText(s) {
        if (s === null || s === undefined) return "";
        return String(s).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
    }

    function composeFullName(firstName, lastName) {
        return normalizeText([decodeStoredText(firstName), decodeStoredText(lastName)].filter((p) => normalizeText(p)).join(" "));
    }

    /** splitFullName(fullName) -> { firstName, lastName }. First word -> firstName, remainder -> lastName. */
    function splitFullName(fullName) {
        const clean = normalizeText(fullName);
        if (!clean) return { firstName: "", lastName: "" };
        const i = clean.indexOf(" ");
        return i === -1 ? { firstName: clean, lastName: "" } : { firstName: clean.slice(0, i), lastName: clean.slice(i + 1) };
    }

    /** initialsFor(fullName) -> up to two uppercase letters (first letter of the first and last word); "" when there is no name. Unicode-safe. */
    function initialsFor(fullName) {
        const words = normalizeText(fullName).split(" ").filter(Boolean);
        if (!words.length) return "";
        const first = Array.from(words[0])[0] || "";
        const last = words.length > 1 ? (Array.from(words[words.length - 1])[0] || "") : "";
        return (first + last).toUpperCase();
    }

    function listCountries() { return COUNTRY_TABLE.map((c) => ({ code: c.code, name: c.name })); }

    /** findCountry(value) -> { code, name } | null. Matches an ISO alpha-2 code or an English name, case-insensitively, after entity-decoding. */
    function findCountry(value) {
        const v = normalizeText(decodeStoredText(value));
        if (!v) return null;
        const byCode = BY_CODE.get(v.toUpperCase());
        if (byCode && v.length === 2) return { code: byCode.code, name: byCode.name };
        const byName = BY_NAME.get(v.toLowerCase());
        return byName ? { code: byName.code, name: byName.name } : null;
    }

    /**
     * fromStoredProfile(profile) — turns IdentityEngine.getProfile()'s
     * stored (escaped) shape into what the form displays.
     *   countryListed=false means a country string is stored that is not
     *   in the ISO list (e.g. free text entered elsewhere): the UI keeps
     *   it selectable as "(current)" so it is never silently erased.
     */
    function fromStoredProfile(profile) {
        const p = profile && typeof profile === "object" ? profile : {};
        const countryRaw = normalizeText(decodeStoredText(p.country));
        const found = countryRaw ? findCountry(countryRaw) : null;
        return {
            firstName: decodeStoredText(p.firstName),
            lastName: decodeStoredText(p.lastName),
            fullName: composeFullName(p.firstName, p.lastName),
            countryRaw,
            countryCode: found ? found.code : "",
            countryName: found ? found.name : countryRaw,
            countryListed: !!found || !countryRaw,
            city: normalizeText(decodeStoredText(p.city))
        };
    }

    /**
     * validateProfileInput(input, current)
     *   input:   { fullName, countryCode, city } — raw form values.
     *            countryCode is an ISO code, "" (none), or
     *            KEEP_CURRENT_COUNTRY.
     *   current: the object fromStoredProfile() returned.
     *   returns: { valid, errors:{fullName?,country?,city?}, changes:{firstName?,lastName?,country?,city?} }
     *   `changes` holds ONLY fields whose value differs from `current`,
     *   in the exact shape IdentityEngine.updateProfile() accepts.
     *   Fails closed: any error -> valid:false and changes:{}.
     */
    function validateProfileInput(input, current) {
        const src = input && typeof input === "object" ? input : {};
        const cur = current && typeof current === "object" ? current : fromStoredProfile(null);
        const errors = {};
        const changes = {};

        const fullName = normalizeText(src.fullName);
        if (fullName.length > LIMITS.fullName) {
            errors.fullName = `Full name must be ${LIMITS.fullName} characters or fewer.`;
        } else if (!fullName) {
            if (cur.fullName) errors.fullName = "Full name cannot be empty.";
        } else if (fullName !== cur.fullName) {
            const parts = splitFullName(fullName);
            changes.firstName = parts.firstName;
            changes.lastName = parts.lastName;
        }

        const code = src.countryCode === null || src.countryCode === undefined ? "" : String(src.countryCode);
        if (code === KEEP_CURRENT_COUNTRY) {
            if (cur.countryListed) errors.country = "Choose a country from the list.";
        } else if (code === "") {
            if (cur.countryRaw) changes.country = null;
        } else {
            const country = BY_CODE.get(code.toUpperCase());
            if (!country) errors.country = "Choose a country from the list.";
            else if (country.name !== cur.countryName || !cur.countryListed) changes.country = country.name;
        }

        const city = normalizeText(src.city);
        if (city.length > LIMITS.city) {
            errors.city = `City must be ${LIMITS.city} characters or fewer.`;
        } else if (city !== cur.city) {
            changes.city = city === "" ? null : city;
        }

        const valid = Object.keys(errors).length === 0;
        return { valid, errors, changes: valid ? changes : {} };
    }

    /** validateProfilePicture(file) — file: { type, size } (a browser File satisfies this). Allow-list type + size bounds. */
    function validateProfilePicture(file) {
        if (!file || typeof file !== "object") return { valid: false, reason: "No picture was selected." };
        if (!PICTURE_ALLOWED_TYPES.includes(String(file.type || "").toLowerCase())) return { valid: false, reason: "Please choose a JPEG, PNG or WebP image." };
        const size = Number(file.size);
        if (!Number.isFinite(size) || size <= 0) return { valid: false, reason: "That file appears to be empty." };
        if (size > PICTURE_MAX_BYTES) return { valid: false, reason: `That picture is too large. Please choose one under ${Math.round(PICTURE_MAX_BYTES / (1024 * 1024))} MB.` };
        return { valid: true };
    }

    /**
     * getPicturePersistenceStatus()
     *   The single honest answer to "is a chosen picture saved anywhere?"
     *   Audited: no user-scoped image storage exists in this repository.
     *   Firebase/firebase-storage.js is present but its own header says
     *   "Not wired into dashboard.html. Not called by anything."; the
     *   IdentityStorage IndexedDB layer has no image store (adding one
     *   is a schema-version migration); and no server endpoint accepts
     *   profile images. Phase 1 therefore previews only. Profile Phase 2
     *   flips this when a real store exists.
     */
    function getPicturePersistenceStatus() {
        return Object.freeze({
            supported: false,
            deferredTo: "Profile Phase 2",
            reason: "No user-scoped image storage exists in CozyOS yet, so a chosen picture is shown as a preview only and is not saved."
        });
    }

    const api = {
        getVersion() { return VERSION; },
        LIMITS,
        KEEP_CURRENT_COUNTRY,
        PICTURE_ALLOWED_TYPES,
        PICTURE_MAX_BYTES,
        listCountries,
        findCountry,
        decodeStoredText,
        normalizeText,
        composeFullName,
        splitFullName,
        initialsFor,
        fromStoredProfile,
        validateProfileInput,
        validateProfilePicture,
        getPicturePersistenceStatus
    };

    if (typeof module !== "undefined" && module.exports) {
        module.exports = api;
    }
    if (root && root.window) {
        root.window.CozyOS = root.window.CozyOS || {};
        root.window.CozyOS.Modules = root.window.CozyOS.Modules || {};
        if (!root.window.CozyOS.Modules["dashboard-profile-core"]) {
            root.window.CozyOS.DashboardProfileCore = api;
            root.window.CozyOS.Modules["dashboard-profile-core"] = Object.freeze({
                version: VERSION,
                description: "User Profile Phase 1 — pure-logic helpers for the Profile surface: ISO 3166-1 country list, full-name <-> firstName/lastName mapping, minimal-diff validation for IdentityEngine.updateProfile(), and profile-picture preview validation. Not a profile store; never infers location; never touches authentication fields."
            });
        }
    }
})(typeof globalThis !== "undefined" ? globalThis : this);

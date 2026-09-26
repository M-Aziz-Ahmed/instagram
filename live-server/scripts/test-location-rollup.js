// Verifies the /analytics/locations $group -> globe mapping against the exact
// shape Mongo returns. A wrong field name (e.g. reading `countryName` from the
// region stage, which emits `country`) silently blanks a whole map tier.
const A = require("../analyticsHelpers");

let failures = 0;
function check(label, got, want) {
    const g = JSON.stringify(got);
    const w = JSON.stringify(want);
    const pass = g === w;
    if (!pass) failures++;
    console.log(`${pass ? "PASS" : "FAIL"}  ${label}`);
    if (!pass) console.log(`        got  ${g}\n        want ${w}`);
}

// --- country rollup ---------------------------------------------------------
check("country: full row", A.mapCountryRollup({
    _id: "PK", name: "Pakistan", lat: 30.3753, lon: 69.3451, count: 12,
}), { code: "PK", name: "Pakistan", count: 12, lat: 30.3753, lon: 69.3451 });

check("country: falls back to code for name", A.mapCountryRollup({
    _id: "PK", name: "", lat: null, lon: null, count: 1,
}), { code: "PK", name: "PK", count: 1, lat: null, lon: null });

// --- region rollup (stage emits `country`, NOT `countryName`) ---------------
check("region: reads `country` from the stage", A.mapRegionRollup({
    _id: { country: "PK", region: "Punjab" },
    name: "Punjab", country: "Pakistan", lat: 31.1471, lon: 74.0885, count: 7,
}), {
    code: "PK:Punjab", name: "Punjab", country: "Pakistan", countryCode: "PK",
    count: 7, lat: 31.1471, lon: 74.0885,
});

check("region: empty region still yields a usable row", A.mapRegionRollup({
    _id: { country: "PK", region: "" }, name: "", country: "Pakistan",
    lat: 30.3753, lon: 69.3451, count: 3,
}), {
    code: "PK:", name: "", country: "Pakistan", countryCode: "PK",
    count: 3, lat: 30.3753, lon: 69.3451,
});

// --- city rollup (stage emits `countryName` and `region`) -------------------
check("city: full row", A.mapCityRollup({
    _id: { country: "PK", region: "Punjab", city: "Lahore" },
    name: "Lahore", region: "Punjab", countryName: "Pakistan",
    lat: 31.5204, lon: 74.3587, count: 5,
}), {
    code: "PK:Punjab:Lahore", name: "Lahore", city: "Lahore", region: "Punjab",
    country: "Pakistan", countryCode: "PK", count: 5, lat: 31.5204, lon: 74.3587,
});

check("city: null coords stay null (not undefined)", A.mapCityRollup({
    _id: { country: "US", region: "NY", city: "NYC" },
    name: "NYC", region: "NY", countryName: "United States",
    lat: null, lon: null, count: 2,
}), {
    code: "US:NY:NYC", name: "NYC", city: "NYC", region: "NY",
    country: "United States", countryCode: "US", count: 2, lat: null, lon: null,
});

// --- coordinate backfill ----------------------------------------------------
const countries = A.backfillCountryCoords(
    [{ code: "PK", name: "Pakistan", count: 5, lat: null, lon: null },
     { code: "US", name: "United States", count: 4, lat: 38.9, lon: -77.0 }],
    [{ code: "PK:Punjab:Lahore", countryCode: "PK", lat: 31.5204, lon: 74.3587 }],
);
check("backfill: fills missing country coords from a city", countries[0],
    { code: "PK", name: "Pakistan", count: 5, lat: 31.5204, lon: 74.3587 });
check("backfill: leaves existing coords alone", countries[1],
    { code: "US", name: "United States", count: 4, lat: 38.9, lon: -77.0 });

// --- every mapped row must survive the Globe's own filter -------------------
// app/admin/page.jsx drops any point missing lat/lon, so a mapper that emits
// undefined coords would make the place invisible.
const all = [
    A.mapCountryRollup({ _id: "PK", name: "Pakistan", lat: 30.3, lon: 69.3, count: 1 }),
    A.mapRegionRollup({ _id: { country: "PK", region: "Punjab" }, name: "Punjab", country: "Pakistan", lat: 31.1, lon: 74.0, count: 1 }),
    A.mapCityRollup({ _id: { country: "PK", region: "Punjab", city: "Lahore" }, name: "Lahore", region: "Punjab", countryName: "Pakistan", lat: 31.5, lon: 74.3, count: 1 }),
];
const usable = all.filter((p) => p.lat != null && p.lon != null);
check("all three tiers produce drawable points", usable.length, 3);
check("tiers carry distinct names", all.map((p) => p.name), ["Pakistan", "Punjab", "Lahore"]);

console.log(failures === 0 ? "\nALL LOCATION ROLLUP TESTS PASS" : `\n${failures} FAILURE(S)`);
process.exit(failures === 0 ? 0 : 1);

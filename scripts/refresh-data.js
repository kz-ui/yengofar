// scripts/refresh-data.js
// Weekly data refresh: fetches TravelTables (cost) + Teleport (safety) APIs,
// merges with static metadata, writes data.json committed by GitHub Actions.
// Run: RAPIDAPI_KEY=xxx node scripts/refresh-data.js

import fs from 'fs';

const RAPIDAPI_KEY = process.env.RAPIDAPI_KEY;
const ROLLING_WINDOW = 78; // 18 months of weekly readings (~4.33 weeks/month × 18)

if (!RAPIDAPI_KEY) {
    console.error('ERROR: RAPIDAPI_KEY environment variable not set.');
    process.exit(1);
}

// ── CITY MANIFEST ────────────────────────────────────────────────────────────
// Static metadata that never (or rarely) changes.
// Fields that DO change are fetched live from the APIs each week.
//
// Fields per city:
//   city, country          → TravelTables lookup keys
//   teleportSlug           → Teleport urban area slug (null = city not in Teleport)
//   region, currency, timezone, bestSeason, visaFreeJapan
//   flightStops, flightHours
//   Safety_Index           → Numbeo baseline (0-100); blended with Teleport where available
//   Budget_Activities, Midrange_Activities, Luxury_Activities
//                          → Manually curated; TravelTables proxies are poor for these

const CITY_MANIFEST = [
    // ── SOUTHEAST ASIA (21) ──────────────────────────────────────────────────
    { city: 'Bangkok',          country: 'Thailand',              region: 'Southeast Asia', currency: 'THB', timezone: 'UTC+7',    bestSeason: 'Nov–Feb', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '6h 30m',     Safety_Index: 60, Budget_Activities: 5,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: 'bangkok' },
    { city: 'Chiang Mai',       country: 'Thailand',              region: 'Southeast Asia', currency: 'THB', timezone: 'UTC+7',    bestSeason: 'Nov–Feb', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '6h 20m',     Safety_Index: 62, Budget_Activities: 5,  Midrange_Activities: 15, Luxury_Activities: 40,  teleportSlug: null },
    { city: 'Phuket',           country: 'Thailand',              region: 'Southeast Asia', currency: 'THB', timezone: 'UTC+7',    bestSeason: 'Nov–Apr', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '7h 10m',     Safety_Index: 58, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 60,  teleportSlug: null },
    { city: 'Pattaya',          country: 'Thailand',              region: 'Southeast Asia', currency: 'THB', timezone: 'UTC+7',    bestSeason: 'Nov–Feb', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '6h 45m',     Safety_Index: 55, Budget_Activities: 5,  Midrange_Activities: 14, Luxury_Activities: 42,  teleportSlug: null },
    { city: 'Ho Chi Minh City', country: 'Vietnam',               region: 'Southeast Asia', currency: 'VND', timezone: 'UTC+7',    bestSeason: 'Dec–Apr', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '5h 30m',     Safety_Index: 63, Budget_Activities: 4,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: 'ho-chi-minh-city' },
    { city: 'Hanoi',            country: 'Vietnam',               region: 'Southeast Asia', currency: 'VND', timezone: 'UTC+7',    bestSeason: 'Oct–Dec', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '5h 20m',     Safety_Index: 65, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 30,  teleportSlug: null },
    { city: 'Da Nang',          country: 'Vietnam',               region: 'Southeast Asia', currency: 'VND', timezone: 'UTC+7',    bestSeason: 'Feb–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '5h 10m',     Safety_Index: 68, Budget_Activities: 4,  Midrange_Activities: 11, Luxury_Activities: 32,  teleportSlug: null },
    { city: 'Bali',             country: 'Indonesia',             region: 'Southeast Asia', currency: 'IDR', timezone: 'UTC+8',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '6h 30m',     Safety_Index: 66, Budget_Activities: 6,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: null },
    { city: 'Jakarta',          country: 'Indonesia',             region: 'Southeast Asia', currency: 'IDR', timezone: 'UTC+7',    bestSeason: 'Jun–Sep', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '7h 20m',     Safety_Index: 52, Budget_Activities: 5,  Midrange_Activities: 14, Luxury_Activities: 40,  teleportSlug: 'jakarta' },
    { city: 'Kuala Lumpur',     country: 'Malaysia',              region: 'Southeast Asia', currency: 'MYR', timezone: 'UTC+8',    bestSeason: 'Mar–Oct', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '7h 00m',     Safety_Index: 67, Budget_Activities: 5,  Midrange_Activities: 14, Luxury_Activities: 40,  teleportSlug: 'kuala-lumpur' },
    { city: 'Penang',           country: 'Malaysia',              region: 'Southeast Asia', currency: 'MYR', timezone: 'UTC+8',    bestSeason: 'Dec–Feb', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '7h 10m',     Safety_Index: 69, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: null },
    { city: 'Singapore',        country: 'Singapore',             region: 'Southeast Asia', currency: 'SGD', timezone: 'UTC+8',    bestSeason: 'Feb–Apr', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '7h 10m',     Safety_Index: 88, Budget_Activities: 10, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: 'singapore' },
    { city: 'Manila',           country: 'Philippines',           region: 'Southeast Asia', currency: 'PHP', timezone: 'UTC+8',    bestSeason: 'Dec–May', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '4h 20m',     Safety_Index: 44, Budget_Activities: 4,  Midrange_Activities: 11, Luxury_Activities: 32,  teleportSlug: 'manila' },
    { city: 'Cebu City',        country: 'Philippines',           region: 'Southeast Asia', currency: 'PHP', timezone: 'UTC+8',    bestSeason: 'Jan–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '4h 30m',     Safety_Index: 46, Budget_Activities: 4,  Midrange_Activities: 11, Luxury_Activities: 30,  teleportSlug: null },
    { city: 'Phnom Penh',       country: 'Cambodia',              region: 'Southeast Asia', currency: 'USD', timezone: 'UTC+7',    bestSeason: 'Nov–Mar', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '6h 20m',     Safety_Index: 50, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 28,  teleportSlug: null },
    { city: 'Siem Reap',        country: 'Cambodia',              region: 'Southeast Asia', currency: 'USD', timezone: 'UTC+7',    bestSeason: 'Nov–Mar', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '6h 30m',     Safety_Index: 55, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 30,  teleportSlug: null },
    { city: 'Vientiane',        country: 'Laos',                  region: 'Southeast Asia', currency: 'USD', timezone: 'UTC+7',    bestSeason: 'Nov–Feb', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '5h 30m',     Safety_Index: 62, Budget_Activities: 3,  Midrange_Activities: 9,  Luxury_Activities: 25,  teleportSlug: null },
    { city: 'Luang Prabang',    country: 'Laos',                  region: 'Southeast Asia', currency: 'USD', timezone: 'UTC+7',    bestSeason: 'Nov–Mar', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '5h 40m',     Safety_Index: 65, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 28,  teleportSlug: null },
    { city: 'Surabaya',         country: 'Indonesia',             region: 'Southeast Asia', currency: 'IDR', timezone: 'UTC+7',    bestSeason: 'Jun–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '7h 30m',     Safety_Index: 55, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 28,  teleportSlug: null },
    { city: 'Davao',            country: 'Philippines',           region: 'Southeast Asia', currency: 'PHP', timezone: 'UTC+8',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '4h 10m',     Safety_Index: 50, Budget_Activities: 3,  Midrange_Activities: 9,  Luxury_Activities: 25,  teleportSlug: null },
    { city: 'Yangon',           country: 'Myanmar',               region: 'Southeast Asia', currency: 'MMK', timezone: 'UTC+6:30', bestSeason: 'Nov–Feb', visaFreeJapan: 'No',  flightStops: 3, flightHours: '6h 50m',     Safety_Index: 42, Budget_Activities: 3,  Midrange_Activities: 8,  Luxury_Activities: 22,  teleportSlug: null },

    // ── EAST ASIA (13) ───────────────────────────────────────────────────────
    { city: 'Tokyo',            country: 'Japan',                 region: 'East Asia',      currency: 'JPY', timezone: 'UTC+9',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 0, flightHours: '0h (origin)', Safety_Index: 85, Budget_Activities: 10, Midrange_Activities: 30, Luxury_Activities: 100, teleportSlug: 'tokyo' },
    { city: 'Osaka',            country: 'Japan',                 region: 'East Asia',      currency: 'JPY', timezone: 'UTC+9',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '1h 20m',     Safety_Index: 84, Budget_Activities: 9,  Midrange_Activities: 26, Luxury_Activities: 85,  teleportSlug: 'osaka' },
    { city: 'Seoul',            country: 'South Korea',           region: 'East Asia',      currency: 'KRW', timezone: 'UTC+9',    bestSeason: 'Sep–Nov', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '2h 30m',     Safety_Index: 82, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 65,  teleportSlug: 'seoul' },
    { city: 'Busan',            country: 'South Korea',           region: 'East Asia',      currency: 'KRW', timezone: 'UTC+9',    bestSeason: 'Sep–Nov', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '1h 30m',     Safety_Index: 81, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: null },
    { city: 'Taipei',           country: 'Taiwan',                region: 'East Asia',      currency: 'TWD', timezone: 'UTC+8',    bestSeason: 'Oct–Dec', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '3h 00m',     Safety_Index: 83, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: 'taipei' },
    { city: 'Taichung',         country: 'Taiwan',                region: 'East Asia',      currency: 'TWD', timezone: 'UTC+8',    bestSeason: 'Oct–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '3h 10m',     Safety_Index: 82, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 40,  teleportSlug: null },
    { city: 'Hong Kong',        country: 'Hong Kong',             region: 'East Asia',      currency: 'HKD', timezone: 'UTC+8',    bestSeason: 'Oct–Dec', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '4h 00m',     Safety_Index: 80, Budget_Activities: 10, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: 'hong-kong' },
    { city: 'Beijing',          country: 'China',                 region: 'East Asia',      currency: 'CNY', timezone: 'UTC+8',    bestSeason: 'Sep–Oct', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '3h 30m',     Safety_Index: 72, Budget_Activities: 6,  Midrange_Activities: 16, Luxury_Activities: 48,  teleportSlug: 'beijing' },
    { city: 'Shanghai',         country: 'China',                 region: 'East Asia',      currency: 'CNY', timezone: 'UTC+8',    bestSeason: 'Apr–May', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '2h 10m',     Safety_Index: 74, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: 'shanghai' },
    { city: 'Chengdu',          country: 'China',                 region: 'East Asia',      currency: 'CNY', timezone: 'UTC+8',    bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '4h 50m',     Safety_Index: 72, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 38,  teleportSlug: null },
    { city: 'Shenzhen',         country: 'China',                 region: 'East Asia',      currency: 'CNY', timezone: 'UTC+8',    bestSeason: 'Oct–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '4h 10m',     Safety_Index: 73, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: null },
    { city: 'Ulaanbaatar',      country: 'Mongolia',              region: 'East Asia',      currency: 'MNT', timezone: 'UTC+8',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '3h 30m',     Safety_Index: 57, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: null },
    { city: 'Macau',            country: 'Macau',                 region: 'East Asia',      currency: 'MOP', timezone: 'UTC+8',    bestSeason: 'Oct–Dec', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '4h 00m',     Safety_Index: 79, Budget_Activities: 8,  Midrange_Activities: 22, Luxury_Activities: 70,  teleportSlug: null },

    // ── SOUTH ASIA (10) ──────────────────────────────────────────────────────
    { city: 'Mumbai',           country: 'India',                 region: 'South Asia',     currency: 'INR', timezone: 'UTC+5:30', bestSeason: 'Nov–Feb', visaFreeJapan: 'No',  flightStops: 1, flightHours: '9h 30m',     Safety_Index: 55, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 35,  teleportSlug: 'mumbai' },
    { city: 'Delhi',            country: 'India',                 region: 'South Asia',     currency: 'INR', timezone: 'UTC+5:30', bestSeason: 'Oct–Mar', visaFreeJapan: 'No',  flightStops: 1, flightHours: '8h 40m',     Safety_Index: 48, Budget_Activities: 3,  Midrange_Activities: 9,  Luxury_Activities: 30,  teleportSlug: 'new-delhi' },
    { city: 'Bangalore',        country: 'India',                 region: 'South Asia',     currency: 'INR', timezone: 'UTC+5:30', bestSeason: 'Oct–Feb', visaFreeJapan: 'No',  flightStops: 2, flightHours: '9h 40m',     Safety_Index: 52, Budget_Activities: 3,  Midrange_Activities: 9,  Luxury_Activities: 28,  teleportSlug: 'bangalore' },
    { city: 'Goa',              country: 'India',                 region: 'South Asia',     currency: 'INR', timezone: 'UTC+5:30', bestSeason: 'Nov–Feb', visaFreeJapan: 'No',  flightStops: 3, flightHours: '9h 20m',     Safety_Index: 60, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: null },
    { city: 'Colombo',          country: 'Sri Lanka',             region: 'South Asia',     currency: 'LKR', timezone: 'UTC+5:30', bestSeason: 'Dec–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '9h 30m',     Safety_Index: 63, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: 'colombo' },
    { city: 'Kathmandu',        country: 'Nepal',                 region: 'South Asia',     currency: 'NPR', timezone: 'UTC+5:45', bestSeason: 'Oct–Nov', visaFreeJapan: 'No',  flightStops: 3, flightHours: '7h 10m',     Safety_Index: 54, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 28,  teleportSlug: null },
    { city: 'Dhaka',            country: 'Bangladesh',            region: 'South Asia',     currency: 'BDT', timezone: 'UTC+6',    bestSeason: 'Nov–Feb', visaFreeJapan: 'No',  flightStops: 3, flightHours: '8h 20m',     Safety_Index: 43, Budget_Activities: 2,  Midrange_Activities: 6,  Luxury_Activities: 18,  teleportSlug: 'dhaka' },
    { city: 'Islamabad',        country: 'Pakistan',              region: 'South Asia',     currency: 'PKR', timezone: 'UTC+5',    bestSeason: 'Mar–May', visaFreeJapan: 'No',  flightStops: 3, flightHours: '8h 50m',     Safety_Index: 40, Budget_Activities: 3,  Midrange_Activities: 7,  Luxury_Activities: 22,  teleportSlug: null },
    { city: 'Lahore',           country: 'Pakistan',              region: 'South Asia',     currency: 'PKR', timezone: 'UTC+5',    bestSeason: 'Nov–Mar', visaFreeJapan: 'No',  flightStops: 3, flightHours: '9h 10m',     Safety_Index: 38, Budget_Activities: 3,  Midrange_Activities: 7,  Luxury_Activities: 20,  teleportSlug: null },
    { city: 'Jaipur',           country: 'India',                 region: 'South Asia',     currency: 'INR', timezone: 'UTC+5:30', bestSeason: 'Oct–Mar', visaFreeJapan: 'No',  flightStops: 3, flightHours: '8h 30m',     Safety_Index: 50, Budget_Activities: 3,  Midrange_Activities: 8,  Luxury_Activities: 25,  teleportSlug: null },

    // ── CENTRAL ASIA & CAUCASUS (9) ──────────────────────────────────────────
    { city: 'Tbilisi',          country: 'Georgia',               region: 'Central Asia',   currency: 'GEL', timezone: 'UTC+4',    bestSeason: 'May–Oct', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '10h 30m',    Safety_Index: 68, Budget_Activities: 5,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: 'tbilisi' },
    { city: 'Yerevan',          country: 'Armenia',               region: 'Central Asia',   currency: 'AMD', timezone: 'UTC+4',    bestSeason: 'May–Oct', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '10h 20m',    Safety_Index: 66, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 40,  teleportSlug: null },
    { city: 'Baku',             country: 'Azerbaijan',            region: 'Central Asia',   currency: 'AZN', timezone: 'UTC+4',    bestSeason: 'Apr–Jun', visaFreeJapan: 'No',  flightStops: 3, flightHours: '10h 40m',    Safety_Index: 63, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 40,  teleportSlug: null },
    { city: 'Almaty',           country: 'Kazakhstan',            region: 'Central Asia',   currency: 'KZT', timezone: 'UTC+6',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '6h 00m',     Safety_Index: 60, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 38,  teleportSlug: null },
    { city: 'Tashkent',         country: 'Uzbekistan',            region: 'Central Asia',   currency: 'UZS', timezone: 'UTC+5',    bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '7h 30m',     Safety_Index: 58, Budget_Activities: 3,  Midrange_Activities: 9,  Luxury_Activities: 25,  teleportSlug: null },
    { city: 'Bishkek',          country: 'Kyrgyzstan',            region: 'Central Asia',   currency: 'KGS', timezone: 'UTC+6',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '6h 40m',     Safety_Index: 56, Budget_Activities: 3,  Midrange_Activities: 7,  Luxury_Activities: 20,  teleportSlug: null },
    { city: 'Samarkand',        country: 'Uzbekistan',            region: 'Central Asia',   currency: 'UZS', timezone: 'UTC+5',    bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '7h 50m',     Safety_Index: 59, Budget_Activities: 4,  Midrange_Activities: 9,  Luxury_Activities: 24,  teleportSlug: null },
    { city: 'Ashgabat',         country: 'Turkmenistan',          region: 'Central Asia',   currency: 'TMT', timezone: 'UTC+5',    bestSeason: 'Apr–May', visaFreeJapan: 'No',  flightStops: 3, flightHours: '8h 00m',     Safety_Index: 40, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 28,  teleportSlug: null },
    { city: 'Nur-Sultan',       country: 'Kazakhstan',            region: 'Central Asia',   currency: 'KZT', timezone: 'UTC+6',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '6h 20m',     Safety_Index: 58, Budget_Activities: 5,  Midrange_Activities: 14, Luxury_Activities: 42,  teleportSlug: null },

    // ── MIDDLE EAST (10) ─────────────────────────────────────────────────────
    { city: 'Dubai',            country: 'United Arab Emirates',  region: 'Middle East',    currency: 'AED', timezone: 'UTC+4',    bestSeason: 'Nov–Mar', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '9h 50m',     Safety_Index: 82, Budget_Activities: 12, Midrange_Activities: 35, Luxury_Activities: 120, teleportSlug: 'dubai' },
    { city: 'Abu Dhabi',        country: 'United Arab Emirates',  region: 'Middle East',    currency: 'AED', timezone: 'UTC+4',    bestSeason: 'Nov–Mar', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '10h 00m',    Safety_Index: 83, Budget_Activities: 10, Midrange_Activities: 30, Luxury_Activities: 100, teleportSlug: null },
    { city: 'Doha',             country: 'Qatar',                 region: 'Middle East',    currency: 'QAR', timezone: 'UTC+3',    bestSeason: 'Nov–Mar', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '10h 30m',    Safety_Index: 80, Budget_Activities: 10, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: null },
    { city: 'Muscat',           country: 'Oman',                  region: 'Middle East',    currency: 'OMR', timezone: 'UTC+4',    bestSeason: 'Oct–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '10h 20m',    Safety_Index: 78, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: null },
    { city: 'Riyadh',           country: 'Saudi Arabia',          region: 'Middle East',    currency: 'SAR', timezone: 'UTC+3',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '10h 20m',    Safety_Index: 72, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 58,  teleportSlug: null },
    { city: 'Amman',            country: 'Jordan',                region: 'Middle East',    currency: 'JOD', timezone: 'UTC+3',    bestSeason: 'Mar–May', visaFreeJapan: 'No',  flightStops: 2, flightHours: '10h 40m',    Safety_Index: 65, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: null },
    { city: 'Beirut',           country: 'Lebanon',               region: 'Middle East',    currency: 'USD', timezone: 'UTC+2',    bestSeason: 'May–Oct', visaFreeJapan: 'No',  flightStops: 3, flightHours: '11h 10m',    Safety_Index: 42, Budget_Activities: 6,  Midrange_Activities: 16, Luxury_Activities: 48,  teleportSlug: null },
    { city: 'Tel Aviv',         country: 'Israel',                region: 'Middle East',    currency: 'ILS', timezone: 'UTC+2',    bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '11h 30m',    Safety_Index: 55, Budget_Activities: 12, Midrange_Activities: 30, Luxury_Activities: 100, teleportSlug: 'tel-aviv' },
    { city: 'Kuwait City',      country: 'Kuwait',                region: 'Middle East',    currency: 'KWD', timezone: 'UTC+3',    bestSeason: 'Nov–Mar', visaFreeJapan: 'No',  flightStops: 2, flightHours: '10h 10m',    Safety_Index: 70, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: null },
    { city: 'Manama',           country: 'Bahrain',               region: 'Middle East',    currency: 'BHD', timezone: 'UTC+3',    bestSeason: 'Nov–Mar', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '10h 00m',    Safety_Index: 74, Budget_Activities: 6,  Midrange_Activities: 16, Luxury_Activities: 50,  teleportSlug: null },

    // ── OCEANIA (13) ─────────────────────────────────────────────────────────
    { city: 'Sydney',           country: 'Australia',             region: 'Oceania',        currency: 'AUD', timezone: 'UTC+11',   bestSeason: 'Sep–Nov', visaFreeJapan: 'No',  flightStops: 1, flightHours: '9h 30m',     Safety_Index: 78, Budget_Activities: 12, Midrange_Activities: 30, Luxury_Activities: 90,  teleportSlug: 'sydney' },
    { city: 'Melbourne',        country: 'Australia',             region: 'Oceania',        currency: 'AUD', timezone: 'UTC+11',   bestSeason: 'Oct–Apr', visaFreeJapan: 'No',  flightStops: 1, flightHours: '10h 00m',    Safety_Index: 76, Budget_Activities: 12, Midrange_Activities: 30, Luxury_Activities: 90,  teleportSlug: 'melbourne' },
    { city: 'Brisbane',         country: 'Australia',             region: 'Oceania',        currency: 'AUD', timezone: 'UTC+10',   bestSeason: 'Jun–Aug', visaFreeJapan: 'No',  flightStops: 1, flightHours: '9h 10m',     Safety_Index: 77, Budget_Activities: 10, Midrange_Activities: 25, Luxury_Activities: 78,  teleportSlug: 'brisbane' },
    { city: 'Perth',            country: 'Australia',             region: 'Oceania',        currency: 'AUD', timezone: 'UTC+8',    bestSeason: 'Sep–Nov', visaFreeJapan: 'No',  flightStops: 1, flightHours: '7h 40m',     Safety_Index: 79, Budget_Activities: 10, Midrange_Activities: 25, Luxury_Activities: 78,  teleportSlug: 'perth' },
    { city: 'Auckland',         country: 'New Zealand',           region: 'Oceania',        currency: 'NZD', timezone: 'UTC+13',   bestSeason: 'Dec–Feb', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '10h 30m',    Safety_Index: 80, Budget_Activities: 12, Midrange_Activities: 28, Luxury_Activities: 85,  teleportSlug: 'auckland' },
    { city: 'Wellington',       country: 'New Zealand',           region: 'Oceania',        currency: 'NZD', timezone: 'UTC+13',   bestSeason: 'Dec–Mar', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '11h 00m',    Safety_Index: 80, Budget_Activities: 11, Midrange_Activities: 26, Luxury_Activities: 80,  teleportSlug: 'wellington' },
    { city: 'Christchurch',     country: 'New Zealand',           region: 'Oceania',        currency: 'NZD', timezone: 'UTC+13',   bestSeason: 'Dec–Feb', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '11h 30m',    Safety_Index: 79, Budget_Activities: 10, Midrange_Activities: 24, Luxury_Activities: 75,  teleportSlug: null },
    { city: 'Gold Coast',       country: 'Australia',             region: 'Oceania',        currency: 'AUD', timezone: 'UTC+10',   bestSeason: 'Jun–Aug', visaFreeJapan: 'No',  flightStops: 2, flightHours: '9h 20m',     Safety_Index: 77, Budget_Activities: 10, Midrange_Activities: 25, Luxury_Activities: 78,  teleportSlug: null },
    { city: 'Suva',             country: 'Fiji',                  region: 'Oceania',        currency: 'FJD', timezone: 'UTC+12',   bestSeason: 'May–Oct', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '9h 00m',     Safety_Index: 60, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 60,  teleportSlug: null },
    { city: 'Nadi',             country: 'Fiji',                  region: 'Oceania',        currency: 'FJD', timezone: 'UTC+12',   bestSeason: 'May–Oct', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '8h 50m',     Safety_Index: 60, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 60,  teleportSlug: null },
    { city: 'Noumea',           country: 'New Caledonia',         region: 'Oceania',        currency: 'XPF', timezone: 'UTC+11',   bestSeason: 'Jul–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '8h 30m',     Safety_Index: 72, Budget_Activities: 10, Midrange_Activities: 25, Luxury_Activities: 75,  teleportSlug: null },
    { city: 'Papeete',          country: 'French Polynesia',      region: 'Oceania',        currency: 'XPF', timezone: 'UTC-10',   bestSeason: 'May–Oct', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '14h 30m',    Safety_Index: 70, Budget_Activities: 12, Midrange_Activities: 30, Luxury_Activities: 95,  teleportSlug: null },
    { city: 'Port Moresby',     country: 'Papua New Guinea',      region: 'Oceania',        currency: 'PGK', timezone: 'UTC+10',   bestSeason: 'May–Oct', visaFreeJapan: 'No',  flightStops: 2, flightHours: '7h 30m',     Safety_Index: 28, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: null },

    // ── EASTERN EUROPE (16) ──────────────────────────────────────────────────
    { city: 'Budapest',         country: 'Hungary',               region: 'Eastern Europe', currency: 'HUF', timezone: 'UTC+1',    bestSeason: 'Apr–Oct', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 30m',    Safety_Index: 72, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: 'budapest' },
    { city: 'Prague',           country: 'Czech Republic',        region: 'Eastern Europe', currency: 'CZK', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 00m',    Safety_Index: 78, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: 'prague' },
    { city: 'Warsaw',           country: 'Poland',                region: 'Eastern Europe', currency: 'PLN', timezone: 'UTC+1',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 20m',    Safety_Index: 74, Budget_Activities: 7,  Midrange_Activities: 17, Luxury_Activities: 52,  teleportSlug: 'warsaw' },
    { city: 'Krakow',           country: 'Poland',                region: 'Eastern Europe', currency: 'PLN', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 40m',    Safety_Index: 75, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: null },
    { city: 'Bucharest',        country: 'Romania',               region: 'Eastern Europe', currency: 'RON', timezone: 'UTC+2',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 30m',    Safety_Index: 66, Budget_Activities: 6,  Midrange_Activities: 14, Luxury_Activities: 42,  teleportSlug: 'bucharest' },
    { city: 'Sofia',            country: 'Bulgaria',              region: 'Eastern Europe', currency: 'BGN', timezone: 'UTC+2',    bestSeason: 'Jun–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 30m',    Safety_Index: 67, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 38,  teleportSlug: 'sofia' },
    { city: 'Belgrade',         country: 'Serbia',                region: 'Eastern Europe', currency: 'RSD', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 20m',    Safety_Index: 65, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 38,  teleportSlug: 'belgrade' },
    { city: 'Tallinn',          country: 'Estonia',               region: 'Eastern Europe', currency: 'EUR', timezone: 'UTC+2',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 10m',    Safety_Index: 75, Budget_Activities: 8,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: 'tallinn' },
    { city: 'Riga',             country: 'Latvia',                region: 'Eastern Europe', currency: 'EUR', timezone: 'UTC+2',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 20m',    Safety_Index: 72, Budget_Activities: 7,  Midrange_Activities: 16, Luxury_Activities: 48,  teleportSlug: 'riga' },
    { city: 'Vilnius',          country: 'Lithuania',             region: 'Eastern Europe', currency: 'EUR', timezone: 'UTC+2',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 30m',    Safety_Index: 72, Budget_Activities: 7,  Midrange_Activities: 16, Luxury_Activities: 48,  teleportSlug: null },
    { city: 'Ljubljana',        country: 'Slovenia',              region: 'Eastern Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'Jun–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 00m',    Safety_Index: 76, Budget_Activities: 8,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: null },
    { city: 'Bratislava',       country: 'Slovakia',              region: 'Eastern Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 10m',    Safety_Index: 74, Budget_Activities: 7,  Midrange_Activities: 16, Luxury_Activities: 48,  teleportSlug: null },
    { city: 'Sarajevo',         country: 'Bosnia and Herzegovina',region: 'Eastern Europe', currency: 'BAM', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '13h 00m',    Safety_Index: 60, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: null },
    { city: 'Skopje',           country: 'North Macedonia',       region: 'Eastern Europe', currency: 'MKD', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '13h 20m',    Safety_Index: 58, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 30,  teleportSlug: null },
    { city: 'Tirana',           country: 'Albania',               region: 'Eastern Europe', currency: 'ALL', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '13h 10m',    Safety_Index: 61, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 30,  teleportSlug: null },
    { city: 'Zagreb',           country: 'Croatia',               region: 'Eastern Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 30m',    Safety_Index: 72, Budget_Activities: 7,  Midrange_Activities: 17, Luxury_Activities: 50,  teleportSlug: null },

    // ── SOUTHERN EUROPE (9) ──────────────────────────────────────────────────
    { city: 'Lisbon',           country: 'Portugal',              region: 'Southern Europe', currency: 'EUR', timezone: 'UTC+0',   bestSeason: 'May–Oct', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '14h 30m',    Safety_Index: 74, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 60,  teleportSlug: 'lisbon' },
    { city: 'Porto',            country: 'Portugal',              region: 'Southern Europe', currency: 'EUR', timezone: 'UTC+0',   bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '14h 40m',    Safety_Index: 74, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: 'porto' },
    { city: 'Athens',           country: 'Greece',                region: 'Southern Europe', currency: 'EUR', timezone: 'UTC+2',   bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 30m',    Safety_Index: 66, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 60,  teleportSlug: 'athens' },
    { city: 'Thessaloniki',     country: 'Greece',                region: 'Southern Europe', currency: 'EUR', timezone: 'UTC+2',   bestSeason: 'May–Oct', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 20m',    Safety_Index: 66, Budget_Activities: 7,  Midrange_Activities: 17, Luxury_Activities: 50,  teleportSlug: null },
    { city: 'Barcelona',        country: 'Spain',                 region: 'Southern Europe', currency: 'EUR', timezone: 'UTC+1',   bestSeason: 'May–Jun', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '14h 00m',    Safety_Index: 65, Budget_Activities: 9,  Midrange_Activities: 22, Luxury_Activities: 70,  teleportSlug: 'barcelona' },
    { city: 'Madrid',           country: 'Spain',                 region: 'Southern Europe', currency: 'EUR', timezone: 'UTC+1',   bestSeason: 'Sep–Nov', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '14h 10m',    Safety_Index: 66, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 62,  teleportSlug: 'madrid' },
    { city: 'Rome',             country: 'Italy',                 region: 'Southern Europe', currency: 'EUR', timezone: 'UTC+1',   bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '13h 30m',    Safety_Index: 64, Budget_Activities: 9,  Midrange_Activities: 22, Luxury_Activities: 70,  teleportSlug: 'rome' },
    { city: 'Milan',            country: 'Italy',                 region: 'Southern Europe', currency: 'EUR', timezone: 'UTC+1',   bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '13h 00m',    Safety_Index: 63, Budget_Activities: 9,  Midrange_Activities: 22, Luxury_Activities: 70,  teleportSlug: 'milan' },
    { city: 'Istanbul',         country: 'Turkey',                region: 'Southern Europe', currency: 'TRY', timezone: 'UTC+3',   bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '11h 30m',    Safety_Index: 58, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: 'istanbul' },

    // ── WESTERN EUROPE (14) ──────────────────────────────────────────────────
    { city: 'London',           country: 'United Kingdom',        region: 'Western Europe', currency: 'GBP', timezone: 'UTC+0',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '12h 30m',    Safety_Index: 67, Budget_Activities: 12, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: 'london' },
    { city: 'Edinburgh',        country: 'United Kingdom',        region: 'Western Europe', currency: 'GBP', timezone: 'UTC+0',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 00m',    Safety_Index: 70, Budget_Activities: 10, Midrange_Activities: 24, Luxury_Activities: 75,  teleportSlug: null },
    { city: 'Paris',            country: 'France',                region: 'Western Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '13h 00m',    Safety_Index: 65, Budget_Activities: 10, Midrange_Activities: 25, Luxury_Activities: 80,  teleportSlug: 'paris' },
    { city: 'Nice',             country: 'France',                region: 'Western Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 20m',    Safety_Index: 65, Budget_Activities: 9,  Midrange_Activities: 22, Luxury_Activities: 70,  teleportSlug: null },
    { city: 'Amsterdam',        country: 'Netherlands',           region: 'Western Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'Apr–May', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '12h 20m',    Safety_Index: 70, Budget_Activities: 10, Midrange_Activities: 25, Luxury_Activities: 80,  teleportSlug: 'amsterdam' },
    { city: 'Berlin',           country: 'Germany',               region: 'Western Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '12h 00m',    Safety_Index: 68, Budget_Activities: 9,  Midrange_Activities: 22, Luxury_Activities: 68,  teleportSlug: 'berlin' },
    { city: 'Munich',           country: 'Germany',               region: 'Western Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'May–Oct', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '12h 30m',    Safety_Index: 74, Budget_Activities: 10, Midrange_Activities: 24, Luxury_Activities: 75,  teleportSlug: 'munich' },
    { city: 'Hamburg',          country: 'Germany',               region: 'Western Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 10m',    Safety_Index: 70, Budget_Activities: 9,  Midrange_Activities: 22, Luxury_Activities: 68,  teleportSlug: 'hamburg' },
    { city: 'Vienna',           country: 'Austria',               region: 'Western Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'Apr–May', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '12h 20m',    Safety_Index: 78, Budget_Activities: 10, Midrange_Activities: 24, Luxury_Activities: 75,  teleportSlug: 'vienna' },
    { city: 'Zurich',           country: 'Switzerland',           region: 'Western Europe', currency: 'CHF', timezone: 'UTC+1',    bestSeason: 'Jun–Sep', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '12h 30m',    Safety_Index: 84, Budget_Activities: 15, Midrange_Activities: 35, Luxury_Activities: 110, teleportSlug: 'zurich' },
    { city: 'Brussels',         country: 'Belgium',               region: 'Western Europe', currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '12h 10m',    Safety_Index: 62, Budget_Activities: 9,  Midrange_Activities: 22, Luxury_Activities: 68,  teleportSlug: 'brussels' },
    { city: 'Copenhagen',       country: 'Denmark',               region: 'Western Europe', currency: 'DKK', timezone: 'UTC+1',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '11h 30m',    Safety_Index: 82, Budget_Activities: 12, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: 'copenhagen' },
    { city: 'Stockholm',        country: 'Sweden',                region: 'Western Europe', currency: 'SEK', timezone: 'UTC+1',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '11h 40m',    Safety_Index: 78, Budget_Activities: 12, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: 'stockholm' },
    { city: 'Oslo',             country: 'Norway',                region: 'Western Europe', currency: 'NOK', timezone: 'UTC+1',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '11h 30m',    Safety_Index: 82, Budget_Activities: 14, Midrange_Activities: 32, Luxury_Activities: 100, teleportSlug: 'oslo' },

    // ── LATIN AMERICA (16) ───────────────────────────────────────────────────
    { city: 'Mexico City',      country: 'Mexico',                region: 'Latin America',  currency: 'MXN', timezone: 'UTC-6',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '14h 30m',    Safety_Index: 42, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 40,  teleportSlug: 'mexico-city' },
    { city: 'Guadalajara',      country: 'Mexico',                region: 'Latin America',  currency: 'MXN', timezone: 'UTC-6',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '15h 00m',    Safety_Index: 40, Budget_Activities: 4,  Midrange_Activities: 11, Luxury_Activities: 34,  teleportSlug: null },
    { city: 'Cancun',           country: 'Mexico',                region: 'Latin America',  currency: 'MXN', timezone: 'UTC-5',    bestSeason: 'Dec–Apr', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '16h 00m',    Safety_Index: 48, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 65,  teleportSlug: null },
    { city: 'Medellin',         country: 'Colombia',              region: 'Latin America',  currency: 'COP', timezone: 'UTC-5',    bestSeason: 'Feb–Mar', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '18h 30m',    Safety_Index: 44, Budget_Activities: 4,  Midrange_Activities: 11, Luxury_Activities: 33,  teleportSlug: 'medellin' },
    { city: 'Bogota',           country: 'Colombia',              region: 'Latin America',  currency: 'COP', timezone: 'UTC-5',    bestSeason: 'Dec–Mar', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '18h 00m',    Safety_Index: 40, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 30,  teleportSlug: 'bogota' },
    { city: 'Cartagena',        country: 'Colombia',              region: 'Latin America',  currency: 'COP', timezone: 'UTC-5',    bestSeason: 'Dec–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '18h 40m',    Safety_Index: 48, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: null },
    { city: 'Buenos Aires',     country: 'Argentina',             region: 'Latin America',  currency: 'ARS', timezone: 'UTC-3',    bestSeason: 'Oct–Mar', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '22h 00m',    Safety_Index: 52, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 40,  teleportSlug: 'buenos-aires' },
    { city: 'Lima',             country: 'Peru',                  region: 'Latin America',  currency: 'PEN', timezone: 'UTC-5',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '19h 30m',    Safety_Index: 42, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 38,  teleportSlug: 'lima' },
    { city: 'Cusco',            country: 'Peru',                  region: 'Latin America',  currency: 'PEN', timezone: 'UTC-5',    bestSeason: 'Apr–Oct', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '20h 00m',    Safety_Index: 50, Budget_Activities: 8,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: null },
    { city: 'Santiago',         country: 'Chile',                 region: 'Latin America',  currency: 'CLP', timezone: 'UTC-3',    bestSeason: 'Dec–Feb', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '22h 30m',    Safety_Index: 60, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: 'santiago' },
    { city: 'Sao Paulo',        country: 'Brazil',                region: 'Latin America',  currency: 'BRL', timezone: 'UTC-3',    bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '21h 00m',    Safety_Index: 38, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 38,  teleportSlug: 'sao-paulo' },
    { city: 'Rio de Janeiro',   country: 'Brazil',                region: 'Latin America',  currency: 'BRL', timezone: 'UTC-3',    bestSeason: 'May–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '21h 30m',    Safety_Index: 35, Budget_Activities: 6,  Midrange_Activities: 14, Luxury_Activities: 45,  teleportSlug: 'rio-de-janeiro' },
    { city: 'Montevideo',       country: 'Uruguay',               region: 'Latin America',  currency: 'UYU', timezone: 'UTC-3',    bestSeason: 'Dec–Mar', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '22h 30m',    Safety_Index: 60, Budget_Activities: 5,  Midrange_Activities: 13, Luxury_Activities: 40,  teleportSlug: null },
    { city: 'Panama City',      country: 'Panama',                region: 'Latin America',  currency: 'USD', timezone: 'UTC-5',    bestSeason: 'Jan–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '17h 30m',    Safety_Index: 50, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: null },
    { city: 'San Jose',         country: 'Costa Rica',            region: 'Latin America',  currency: 'CRC', timezone: 'UTC-6',    bestSeason: 'Dec–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '17h 00m',    Safety_Index: 55, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: null },
    { city: 'Quito',            country: 'Ecuador',               region: 'Latin America',  currency: 'USD', timezone: 'UTC-5',    bestSeason: 'Jun–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '18h 30m',    Safety_Index: 45, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 36,  teleportSlug: null },

    // ── NORTH AMERICA (5) ────────────────────────────────────────────────────
    { city: 'New York',         country: 'United States',         region: 'North America',  currency: 'USD', timezone: 'UTC-5',    bestSeason: 'Sep–Nov', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '13h 00m',    Safety_Index: 60, Budget_Activities: 15, Midrange_Activities: 35, Luxury_Activities: 120, teleportSlug: 'new-york' },
    { city: 'Los Angeles',      country: 'United States',         region: 'North America',  currency: 'USD', timezone: 'UTC-8',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 0, flightHours: '11h 30m',    Safety_Index: 55, Budget_Activities: 12, Midrange_Activities: 30, Luxury_Activities: 100, teleportSlug: 'los-angeles' },
    { city: 'Chicago',          country: 'United States',         region: 'North America',  currency: 'USD', timezone: 'UTC-6',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '12h 30m',    Safety_Index: 50, Budget_Activities: 12, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: 'chicago' },
    { city: 'Toronto',          country: 'Canada',                region: 'North America',  currency: 'CAD', timezone: 'UTC-5',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 1, flightHours: '13h 30m',    Safety_Index: 73, Budget_Activities: 12, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: 'toronto' },
    { city: 'Vancouver',        country: 'Canada',                region: 'North America',  currency: 'CAD', timezone: 'UTC-8',    bestSeason: 'Jun–Sep', visaFreeJapan: 'Yes', flightStops: 0, flightHours: '9h 30m',     Safety_Index: 72, Budget_Activities: 12, Midrange_Activities: 28, Luxury_Activities: 90,  teleportSlug: 'vancouver' },

    // ── AFRICA (14) ──────────────────────────────────────────────────────────
    { city: 'Cape Town',        country: 'South Africa',          region: 'Africa',         currency: 'ZAR', timezone: 'UTC+2',    bestSeason: 'Oct–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '16h 30m',    Safety_Index: 42, Budget_Activities: 7,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: 'cape-town' },
    { city: 'Johannesburg',     country: 'South Africa',          region: 'Africa',         currency: 'ZAR', timezone: 'UTC+2',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '16h 00m',    Safety_Index: 35, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: 'johannesburg' },
    { city: 'Nairobi',          country: 'Kenya',                 region: 'Africa',         currency: 'KES', timezone: 'UTC+3',    bestSeason: 'Jul–Oct', visaFreeJapan: 'No',  flightStops: 2, flightHours: '13h 30m',    Safety_Index: 38, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: 'nairobi' },
    { city: 'Marrakech',        country: 'Morocco',               region: 'Africa',         currency: 'MAD', timezone: 'UTC+1',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '14h 30m',    Safety_Index: 55, Budget_Activities: 7,  Midrange_Activities: 16, Luxury_Activities: 50,  teleportSlug: null },
    { city: 'Casablanca',       country: 'Morocco',               region: 'Africa',         currency: 'MAD', timezone: 'UTC+1',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '14h 20m',    Safety_Index: 55, Budget_Activities: 6,  Midrange_Activities: 14, Luxury_Activities: 42,  teleportSlug: 'casablanca' },
    { city: 'Cairo',            country: 'Egypt',                 region: 'Africa',         currency: 'EGP', timezone: 'UTC+2',    bestSeason: 'Oct–Apr', visaFreeJapan: 'No',  flightStops: 2, flightHours: '12h 30m',    Safety_Index: 50, Budget_Activities: 8,  Midrange_Activities: 18, Luxury_Activities: 55,  teleportSlug: 'cairo' },
    { city: 'Accra',            country: 'Ghana',                 region: 'Africa',         currency: 'GHS', timezone: 'UTC+0',    bestSeason: 'Nov–Mar', visaFreeJapan: 'No',  flightStops: 2, flightHours: '16h 00m',    Safety_Index: 52, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 30,  teleportSlug: 'accra' },
    { city: 'Lagos',            country: 'Nigeria',               region: 'Africa',         currency: 'NGN', timezone: 'UTC+1',    bestSeason: 'Nov–Feb', visaFreeJapan: 'No',  flightStops: 2, flightHours: '16h 20m',    Safety_Index: 33, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 30,  teleportSlug: 'lagos' },
    { city: 'Dar es Salaam',    country: 'Tanzania',              region: 'Africa',         currency: 'TZS', timezone: 'UTC+3',    bestSeason: 'Jun–Oct', visaFreeJapan: 'No',  flightStops: 2, flightHours: '14h 00m',    Safety_Index: 42, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 36,  teleportSlug: null },
    { city: 'Addis Ababa',      country: 'Ethiopia',              region: 'Africa',         currency: 'ETB', timezone: 'UTC+3',    bestSeason: 'Oct–Jan', visaFreeJapan: 'No',  flightStops: 2, flightHours: '12h 30m',    Safety_Index: 45, Budget_Activities: 3,  Midrange_Activities: 8,  Luxury_Activities: 24,  teleportSlug: null },
    { city: 'Tunis',            country: 'Tunisia',               region: 'Africa',         currency: 'TND', timezone: 'UTC+1',    bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 30m',    Safety_Index: 55, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 36,  teleportSlug: null },
    { city: 'Kampala',          country: 'Uganda',                region: 'Africa',         currency: 'UGX', timezone: 'UTC+3',    bestSeason: 'Jun–Aug', visaFreeJapan: 'No',  flightStops: 2, flightHours: '14h 30m',    Safety_Index: 40, Budget_Activities: 3,  Midrange_Activities: 8,  Luxury_Activities: 24,  teleportSlug: null },
    { city: 'Dakar',            country: 'Senegal',               region: 'Africa',         currency: 'XOF', timezone: 'UTC+0',    bestSeason: 'Nov–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '17h 00m',    Safety_Index: 55, Budget_Activities: 4,  Midrange_Activities: 10, Luxury_Activities: 30,  teleportSlug: null },
    { city: 'Lusaka',           country: 'Zambia',                region: 'Africa',         currency: 'ZMW', timezone: 'UTC+2',    bestSeason: 'May–Aug', visaFreeJapan: 'No',  flightStops: 2, flightHours: '16h 30m',    Safety_Index: 40, Budget_Activities: 3,  Midrange_Activities: 8,  Luxury_Activities: 24,  teleportSlug: null },

    // ── INDIAN OCEAN / ISLANDS (new) ─────────────────────────────────────────
    { city: 'Malé',             country: 'Maldives',              region: 'South Asia',     currency: 'MVR', timezone: 'UTC+5',    bestSeason: 'Nov–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '9h 30m',     Safety_Index: 72, Budget_Activities: 20, Midrange_Activities: 60, Luxury_Activities: 200, teleportSlug: null },
    { city: 'Zanzibar',         country: 'Tanzania',              region: 'Africa',         currency: 'TZS', timezone: 'UTC+3',    bestSeason: 'Jun–Oct', visaFreeJapan: 'No',  flightStops: 2, flightHours: '13h 30m',    Safety_Index: 52, Budget_Activities: 8,  Midrange_Activities: 22, Luxury_Activities: 65,  teleportSlug: null },
    { city: 'El Nido',          country: 'Philippines',           region: 'Southeast Asia', currency: 'PHP', timezone: 'UTC+8',    bestSeason: 'Nov–May', visaFreeJapan: 'Yes', flightStops: 3, flightHours: '5h 00m',     Safety_Index: 60, Budget_Activities: 10, Midrange_Activities: 25, Luxury_Activities: 75,  teleportSlug: null },
    { city: 'Lombok',           country: 'Indonesia',             region: 'Southeast Asia', currency: 'IDR', timezone: 'UTC+8',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '6h 50m',     Safety_Index: 62, Budget_Activities: 6,  Midrange_Activities: 16, Luxury_Activities: 50,  teleportSlug: null },

    // ── SOUTHERN EUROPE (new) ────────────────────────────────────────────────
    { city: 'Dubrovnik',        country: 'Croatia',               region: 'Southern Europe',currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'May–Jun', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 00m',    Safety_Index: 76, Budget_Activities: 10, Midrange_Activities: 25, Luxury_Activities: 80,  teleportSlug: null },
    { city: 'Split',            country: 'Croatia',               region: 'Southern Europe',currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 10m',    Safety_Index: 76, Budget_Activities: 8,  Midrange_Activities: 20, Luxury_Activities: 60,  teleportSlug: null },
    { city: 'Valletta',         country: 'Malta',                 region: 'Southern Europe',currency: 'EUR', timezone: 'UTC+1',    bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 20m',    Safety_Index: 74, Budget_Activities: 9,  Midrange_Activities: 22, Luxury_Activities: 68,  teleportSlug: null },
    { city: 'Santorini',        country: 'Greece',                region: 'Southern Europe',currency: 'EUR', timezone: 'UTC+2',    bestSeason: 'Apr–Jun', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '13h 40m',    Safety_Index: 72, Budget_Activities: 12, Midrange_Activities: 30, Luxury_Activities: 100, teleportSlug: null },
    { city: 'Mykonos',          country: 'Greece',                region: 'Southern Europe',currency: 'EUR', timezone: 'UTC+2',    bestSeason: 'May–Sep', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '14h 00m',    Safety_Index: 72, Budget_Activities: 12, Midrange_Activities: 32, Luxury_Activities: 110, teleportSlug: null },

    // ── WESTERN EUROPE (new) ─────────────────────────────────────────────────
    { city: 'Reykjavik',        country: 'Iceland',               region: 'Western Europe', currency: 'ISK', timezone: 'UTC+0',    bestSeason: 'Jun–Aug', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '14h 00m',    Safety_Index: 90, Budget_Activities: 20, Midrange_Activities: 50, Luxury_Activities: 150, teleportSlug: 'reykjavik' },

    // ── SOUTHEAST ASIA (new) ─────────────────────────────────────────────────
    { city: 'Hoi An',           country: 'Vietnam',               region: 'Southeast Asia', currency: 'VND', timezone: 'UTC+7',    bestSeason: 'Feb–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '5h 10m',     Safety_Index: 70, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: null },
    { city: 'Sapa',             country: 'Vietnam',               region: 'Southeast Asia', currency: 'VND', timezone: 'UTC+7',    bestSeason: 'Mar–May', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '5h 30m',     Safety_Index: 68, Budget_Activities: 5,  Midrange_Activities: 12, Luxury_Activities: 35,  teleportSlug: null },

    // ── LATIN AMERICA (new) ──────────────────────────────────────────────────
    { city: 'Oaxaca',           country: 'Mexico',                region: 'Latin America',  currency: 'MXN', timezone: 'UTC-6',    bestSeason: 'Oct–Apr', visaFreeJapan: 'Yes', flightStops: 2, flightHours: '15h 30m',    Safety_Index: 50, Budget_Activities: 5,  Midrange_Activities: 14, Luxury_Activities: 42,  teleportSlug: null },
    { city: 'Havana',           country: 'Cuba',                  region: 'Latin America',  currency: 'CUP', timezone: 'UTC-5',    bestSeason: 'Dec–Apr', visaFreeJapan: 'No',  flightStops: 2, flightHours: '17h 30m',    Safety_Index: 60, Budget_Activities: 6,  Midrange_Activities: 15, Luxury_Activities: 45,  teleportSlug: null },
];

// ── API FETCH FUNCTIONS ───────────────────────────────────────────────────────

async function fetchTravelTables(city, country) {
    const url = `https://cost-of-living-and-prices.p.rapidapi.com/prices?city_name=${encodeURIComponent(city)}&country_name=${encodeURIComponent(country)}`;
    try {
        const res = await fetch(url, {
            headers: {
                'x-rapidapi-host': 'cost-of-living-and-prices.p.rapidapi.com',
                'x-rapidapi-key': RAPIDAPI_KEY,
            },
        });
        if (!res.ok) {
            console.warn(`  TravelTables ${city}: HTTP ${res.status}`);
            return null;
        }
        const data = await res.json();
        return data.prices ?? null; // array of { good_id, name, category_name, usd: { avg } }
    } catch (err) {
        console.warn(`  TravelTables ${city}: ${err.message}`);
        return null;
    }
}

async function fetchTeleportSafety(slug) {
    if (!slug) return null;
    try {
        const res = await fetch(`https://api.teleport.org/api/urban_areas/slug:${slug}/scores/`);
        if (!res.ok) {
            console.warn(`  Teleport ${slug}: HTTP ${res.status}`);
            return null;
        }
        const data = await res.json();
        const safety = data.categories?.find(c => c.name === 'Safety');
        return safety ? Math.round(safety.score_out_of_10 * 10) : null;
    } catch (err) {
        console.warn(`  Teleport ${slug}: ${err.message}`);
        return null;
    }
}

// ── DATA EXTRACTION ───────────────────────────────────────────────────────────

function extractCosts(prices) {
    // prices is array of { good_id, name, category_name, usd: { avg, min, max } }
    // Use fuzzy lowercase partial matching — API names vary slightly by version.
    const get = (...keywords) => {
        const kws = keywords.map(k => k.toLowerCase());
        const item = prices.find(p => {
            const n = (p.name || '').toLowerCase();
            return kws.every(k => n.includes(k));
        });
        return item?.usd?.avg ?? null;
    };

    // Debug: log all item names on first call so we can verify in Action logs
    if (!extractCosts._logged) {
        extractCosts._logged = true;
        console.log('  Sample price item names:', prices.slice(0, 5).map(p => p.name).join(' | '));
    }

    const midrangeRaw = get('meal', '2', 'mid') ?? get('meal', 'two', 'mid') ?? get('restaurant', 'mid');
    const taxiRaw     = get('taxi', '1km') ?? get('taxi', 'km');

    return {
        Budget_Accommodation:   get('hotel', 'budget')    ?? get('hostel'),
        Midrange_Accommodation: get('hotel', 'midrange')  ?? get('hotel', 'mid-range') ?? get('hotel', 'standard'),
        Luxury_Accommodation:   get('hotel', 'luxury')    ?? get('hotel', '5-star') ?? get('hotel', 'deluxe'),
        Cheap_Meal:             get('meal', 'inexpensive') ?? get('meal', 'cheap') ?? get('fast food'),
        Midrange_Meal:          midrangeRaw !== null ? Math.round(midrangeRaw / 2 * 100) / 100 : null,
        Expensive_Meal:         get('meal', 'high end')   ?? get('fine dining') ?? get('meal', 'expensive'),
        Local_Transport:        get('one-way', 'ticket')  ?? get('local transport') ?? get('bus ticket'),
        Taxi:                   taxiRaw !== null ? Math.round(taxiRaw * 8 * 100) / 100 : null,
    };
}

// ── MAIN ──────────────────────────────────────────────────────────────────────

async function run() {
    console.log(`Starting data refresh for ${CITY_MANIFEST.length} cities…`);

    // Load existing data.json for rolling averages (graceful if missing)
    let existing = {};
    try {
        const raw = fs.readFileSync('data.json', 'utf8');
        const parsed = JSON.parse(raw);
        existing = Object.fromEntries(parsed.cities.map(c => [c.City, c]));
        console.log(`Loaded existing data.json (${parsed.cities.length} cities, generated ${parsed.generated?.split('T')[0]})`);
    } catch {
        console.log('No existing data.json found — cold start, seeding from manifest defaults.');
    }

    const cities = [];
    let successCount = 0;
    let fallbackCount = 0;

    for (const manifest of CITY_MANIFEST) {
        process.stdout.write(`  ${manifest.city}…`);

        // Rate-limit: 400ms delay → ~2.5 req/s; well within RapidAPI limits
        await new Promise(r => setTimeout(r, 400));

        // Fetch both APIs in parallel for this city
        const [ttPrices, teleportSafety] = await Promise.all([
            fetchTravelTables(manifest.city, manifest.country),
            fetchTeleportSafety(manifest.teleportSlug),
        ]);

        // Cost data: use TravelTables if available, else fall back to previous week
        const prev = existing[manifest.city] || {};
        let costs;
        if (ttPrices && ttPrices.length > 0) {
            costs = extractCosts(ttPrices);
            successCount++;
            process.stdout.write(' ✓\n');
        } else {
            // Fall back to previous week's live costs (or null if first run)
            costs = {
                Budget_Accommodation:   prev.Budget_Accommodation   ?? null,
                Midrange_Accommodation: prev.Midrange_Accommodation ?? null,
                Luxury_Accommodation:   prev.Luxury_Accommodation   ?? null,
                Cheap_Meal:             prev.Cheap_Meal             ?? null,
                Midrange_Meal:          prev.Midrange_Meal          ?? null,
                Expensive_Meal:         prev.Expensive_Meal         ?? null,
                Local_Transport:        prev.Local_Transport        ?? null,
                Taxi:                   prev.Taxi                   ?? null,
            };
            fallbackCount++;
            process.stdout.write(ttPrices === null ? ' (API fallback)\n' : ' (no prices in response)\n');
        }

        // Safety: blend Numbeo baseline (60%) with Teleport live score (40%)
        let safetyIndex = manifest.Safety_Index;
        if (teleportSafety !== null) {
            safetyIndex = Math.round(manifest.Safety_Index * 0.6 + teleportSafety * 0.4);
        }

        // Rolling 18-month daily cost average
        // Uses same formula as calcDaily() at midrange tier
        const midrangeDaily = (costs.Midrange_Accommodation ?? 0)
            + (costs.Cheap_Meal ?? 0)
            + (costs.Midrange_Meal ?? 0) * 2    // breakfast + lunch as cheap, dinner as midrange
            + (costs.Local_Transport ?? 0) * 2   // round trip
            + (manifest.Midrange_Activities ?? 0);

        const history = prev.daily_history ?? [midrangeDaily]; // seed from current if no history
        const updatedHistory = [...history, midrangeDaily].slice(-ROLLING_WINDOW);
        const avg18m = Math.round(
            updatedHistory.reduce((s, v) => s + v, 0) / updatedHistory.length
        );

        cities.push({
            // ── Static fields (sourced from manifest) ──
            City:             manifest.city,
            Country:          manifest.country,
            Region:           manifest.region,
            Currency:         manifest.currency,
            Timezone:         manifest.timezone,
            Best_Season:      manifest.bestSeason,
            Visa_Free_Japan:  manifest.visaFreeJapan,
            Flight_Stops:     manifest.flightStops,
            Flight_Hours:     manifest.flightHours,
            Budget_Activities:    manifest.Budget_Activities,
            Midrange_Activities:  manifest.Midrange_Activities,
            Luxury_Activities:    manifest.Luxury_Activities,

            // ── Live cost fields (from TravelTables) ──
            ...costs,

            // ── Blended safety score ──
            Safety_Index: safetyIndex,

            // ── Rolling average ──
            Avg18m_Daily: avg18m,

            // ── Internal: rolling history array (not shown in UI) ──
            daily_history: updatedHistory,

            // ── Metadata ──
            last_updated: new Date().toISOString().split('T')[0],
        });
    }

    const output = {
        generated: new Date().toISOString(),
        source: 'TravelTables (RapidAPI) + Teleport',
        cities,
    };

    fs.writeFileSync('data.json', JSON.stringify(output, null, 2));

    console.log('\n──────────────────────────────────────');
    console.log(`✓ data.json written — ${cities.length} cities`);
    console.log(`  Live TravelTables data: ${successCount} cities`);
    console.log(`  Fallback to previous:   ${fallbackCount} cities`);
    console.log(`  Teleport safety available: ${cities.filter(c => c.Safety_Index !== CITY_MANIFEST.find(m => m.city === c.City)?.Safety_Index).length} cities blended`);
}

run().catch(err => {
    console.error('Fatal error:', err);
    process.exit(1);
});

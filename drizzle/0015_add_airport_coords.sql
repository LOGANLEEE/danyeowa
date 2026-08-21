-- Coordinates for the seeded airports, so a layover can carry a real forecast.
--
-- Source: OurAirports (public domain), matched on iata_code; all 108 seeded codes resolved,
-- preferring the large/medium airport where an IATA repeats. Rounded to 5dp — ~1m, far finer
-- than a weather grid cell needs.
--
-- Nullable on purpose: airports that self-warm in from a live provider (source='live-api')
-- arrive with no coordinates, and a NULL has to mean "no forecast for this station" rather
-- than a guessed point. Fabricating a location would put a confident wrong forecast on the
-- card, which is the failure the weather tiles were dropped for in the first place.
--
-- The UPDATEs below fill rows that already exist (production). A fresh local DB has none yet
-- at this point, so scripts/seed-airports.sql carries the same coordinates in its INSERT.
ALTER TABLE `airports` ADD COLUMN `lat` real;
--> statement-breakpoint
ALTER TABLE `airports` ADD COLUMN `lng` real;
--> statement-breakpoint
UPDATE `airports` SET `lat` = 5.26139, `lng` = -3.92629 WHERE `iata` = 'ABJ';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 5.60519, `lng` = -0.16679 WHERE `iata` = 'ACC';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 8.97789, `lng` = 38.7993 WHERE `iata` = 'ADD';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -37.01199, `lng` = 174.78633 WHERE `iata` = 'AKL';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 36.69389, `lng` = 3.21453 WHERE `iata` = 'ALG';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 23.0772, `lng` = 72.6347 WHERE `iata` = 'AMD';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 31.7226, `lng` = 35.9932 WHERE `iata` = 'AMM';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 52.3086, `lng` = 4.76389 WHERE `iata` = 'AMS';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 59.64849, `lng` = 17.92883 WHERE `iata` = 'ARN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 37.9364, `lng` = 23.9445 WHERE `iata` = 'ATH';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 26.2673, `lng` = 50.63764 WHERE `iata` = 'BAH';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 41.2971, `lng` = 2.07846 WHERE `iata` = 'BCN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 33.81983, `lng` = 35.48744 WHERE `iata` = 'BEY';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 52.4539, `lng` = -1.74803 WHERE `iata` = 'BHX';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 13.6811, `lng` = 100.747 WHERE `iata` = 'BKK';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 13.1979, `lng` = 77.7063 WHERE `iata` = 'BLR';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -27.3842, `lng` = 153.117 WHERE `iata` = 'BNE';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 19.0887, `lng` = 72.8679 WHERE `iata` = 'BOM';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 42.36197, `lng` = -71.0079 WHERE `iata` = 'BOS';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 50.9014, `lng` = 4.48444 WHERE `iata` = 'BRU';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 47.43018, `lng` = 19.26239 WHERE `iata` = 'BUD';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 30.11153, `lng` = 31.39669 WHERE `iata` = 'CAI';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 23.3924, `lng` = 113.299 WHERE `iata` = 'CAN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 22.65401, `lng` = 88.44765 WHERE `iata` = 'CCU';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 49.00896, `lng` = 2.55412 WHERE `iata` = 'CDG';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -6.12557, `lng` = 106.656 WHERE `iata` = 'CGK';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -43.48903, `lng` = 172.53206 WHERE `iata` = 'CHC';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 7.18076, `lng` = 79.8841 WHERE `iata` = 'CMB';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 33.3675, `lng` = -7.58997 WHERE `iata` = 'CMN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 10.15105, `lng` = 76.40084 WHERE `iata` = 'COK';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 55.6179, `lng` = 12.656 WHERE `iata` = 'CPH';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -33.97403, `lng` = 18.60433 WHERE `iata` = 'CPT';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 23.84335, `lng` = 90.39778 WHERE `iata` = 'DAC';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -6.8735, `lng` = 39.20729 WHERE `iata` = 'DAR';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 28.55563, `lng` = 77.09519 WHERE `iata` = 'DEL';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 32.8968, `lng` = -97.038 WHERE `iata` = 'DFW';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 55.4088, `lng` = 37.9063 WHERE `iata` = 'DME';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 25.27306, `lng` = 51.60806 WHERE `iata` = 'DOH';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -8.74841, `lng` = 115.16712 WHERE `iata` = 'DPS';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 53.42871, `lng` = -6.26212 WHERE `iata` = 'DUB';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -29.61444, `lng` = 31.11972 WHERE `iata` = 'DUR';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 51.2895, `lng` = 6.76678 WHERE `iata` = 'DUS';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 25.24979, `lng` = 55.37099 WHERE `iata` = 'DXB';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 55.95014, `lng` = -3.37229 WHERE `iata` = 'EDI';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -34.8222, `lng` = -58.5358 WHERE `iata` = 'EZE';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 41.80453, `lng` = 12.252 WHERE `iata` = 'FCO';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 50.02671, `lng` = 8.55835 WHERE `iata` = 'FRA';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -23.43127, `lng` = -46.46995 WHERE `iata` = 'GRU';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 46.2381, `lng` = 6.10895 WHERE `iata` = 'GVA';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 53.6304, `lng` = 9.98823 WHERE `iata` = 'HAM';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 21.2212, `lng` = 105.807 WHERE `iata` = 'HAN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 60.31836, `lng` = 24.96334 WHERE `iata` = 'HEL';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 22.31184, `lng` = 113.91486 WHERE `iata` = 'HKG';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 35.54968, `lng` = 139.78696 WHERE `iata` = 'HND';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 17.23132, `lng` = 78.42986 WHERE `iata` = 'HYD';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 38.9445, `lng` = -77.4558 WHERE `iata` = 'IAD';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 29.9844, `lng` = -95.3414 WHERE `iata` = 'IAH';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 37.4691, `lng` = 126.451 WHERE `iata` = 'ICN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 33.549, `lng` = 72.82566 WHERE `iata` = 'ISB';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 41.27487, `lng` = 28.73214 WHERE `iata` = 'IST';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 21.68024, `lng` = 39.15744 WHERE `iata` = 'JED';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 40.63945, `lng` = -73.77932 WHERE `iata` = 'JFK';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -26.14008, `lng` = 28.2468 WHERE `iata` = 'JNB';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 24.9065, `lng` = 67.1608 WHERE `iata` = 'KHI';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 27.6966, `lng` = 85.3591 WHERE `iata` = 'KTM';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 2.74558, `lng` = 101.71 WHERE `iata` = 'KUL';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 29.22449, `lng` = 47.96981 WHERE `iata` = 'KWI';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 33.9425, `lng` = -118.408 WHERE `iata` = 'LAX';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 51.14874, `lng` = -0.18574 WHERE `iata` = 'LGW';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 31.5216, `lng` = 74.4036 WHERE `iata` = 'LHE';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 51.47075, `lng` = -0.45991 WHERE `iata` = 'LHR';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 38.7813, `lng` = -9.13592 WHERE `iata` = 'LIS';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 6.57737, `lng` = 3.32116 WHERE `iata` = 'LOS';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 12.99001, `lng` = 80.1693 WHERE `iata` = 'MAA';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 40.49341, `lng` = -3.57225 WHERE `iata` = 'MAD';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 53.34938, `lng` = -2.27952 WHERE `iata` = 'MAN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 23.60022, `lng` = 58.28527 WHERE `iata` = 'MCT';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -37.67073, `lng` = 144.8379 WHERE `iata` = 'MEL';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 25.79601, `lng` = -80.28975 WHERE `iata` = 'MIA';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 4.19183, `lng` = 73.5291 WHERE `iata` = 'MLE';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 14.5086, `lng` = 121.02 WHERE `iata` = 'MNL';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -20.4302, `lng` = 57.6836 WHERE `iata` = 'MRU';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 48.3538, `lng` = 11.7861 WHERE `iata` = 'MUC';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 45.6306, `lng` = 8.72811 WHERE `iata` = 'MXP';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -1.31889, `lng` = 36.92823 WHERE `iata` = 'NBO';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 35.76858, `lng` = 140.38871 WHERE `iata` = 'NRT';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 41.9786, `lng` = -87.9048 WHERE `iata` = 'ORD';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 60.1939, `lng` = 11.1004 WHERE `iata` = 'OSL';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 40.07735, `lng` = 116.5967 WHERE `iata` = 'PEK';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -31.9403, `lng` = 115.967 WHERE `iata` = 'PER';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 11.54716, `lng` = 104.8447 WHERE `iata` = 'PNH';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 50.10087, `lng` = 14.25991 WHERE `iata` = 'PRG';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 31.1434, `lng` = 121.805 WHERE `iata` = 'PVG';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 24.9576, `lng` = 46.6988 WHERE `iata` = 'RUH';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 47.44794, `lng` = -122.31028 WHERE `iata` = 'SEA';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -4.67434, `lng` = 55.5218 WHERE `iata` = 'SEZ';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 37.61981, `lng` = -122.37482 WHERE `iata` = 'SFO';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 10.8188, `lng` = 106.652 WHERE `iata` = 'SGN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 1.35019, `lng` = 103.994 WHERE `iata` = 'SIN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 17.0387, `lng` = 54.0913 WHERE `iata` = 'SLL';
--> statement-breakpoint
UPDATE `airports` SET `lat` = -33.9461, `lng` = 151.177 WHERE `iata` = 'SYD';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 25.0777, `lng` = 121.233 WHERE `iata` = 'TPE';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 36.851, `lng` = 10.2272 WHERE `iata` = 'TUN';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 45.5053, `lng` = 12.3519 WHERE `iata` = 'VCE';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 48.1103, `lng` = 16.5697 WHERE `iata` = 'VIE';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 52.1657, `lng` = 20.9671 WHERE `iata` = 'WAW';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 43.67594, `lng` = -79.62942 WHERE `iata` = 'YYZ';
--> statement-breakpoint
UPDATE `airports` SET `lat` = 47.45806, `lng` = 8.54806 WHERE `iata` = 'ZRH';

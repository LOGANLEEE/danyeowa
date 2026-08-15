-- A multi-sector flight number is one aircraft routing, not one crew duty: EK205 flies
-- DXB -> MXP -> JFK and the crew can change at Milan. `operating` marks the legs the crew
-- member actually works; the rest are the aircraft's onward routing, kept so the routing stays
-- true but excluded from every derived time.
--
-- Additive with DEFAULT 1: every existing row becomes operating, which is correct — until now
-- the app only ever stored legs the crew flies.
ALTER TABLE `flights` ADD COLUMN `operating` integer DEFAULT 1 NOT NULL;

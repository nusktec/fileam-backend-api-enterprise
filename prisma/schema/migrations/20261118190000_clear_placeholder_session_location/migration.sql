-- Sessions were stored with a hardcoded city. No geolocation source exists, so clear those values.
UPDATE "Token" SET "location" = NULL WHERE "location" = 'Lagos, Nigeria';

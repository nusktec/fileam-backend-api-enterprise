/**
 * Alternative ID generation approaches using popular packages
 * Uncomment and install the package you prefer
 */

// Option 1: Using shortid (short, URL-safe, unique string IDs)
// npm install shortid
// import shortid from 'shortid';
// export const generateShortId = () => shortid.generate(); // e.g., "V1StGXR8_Z5jdHi6B-myT"

// Option 2: Using nanoid (small, secure, URL-friendly unique string ID)
// npm install nanoid
// import { nanoid } from 'nanoid';
// export const generateNanoId = () => nanoid(8); // 8-character ID

// Option 3: Using cuid (Collision-resistant Unique Identifier)
// npm install cuid
// import { cuid } from 'cuid';
// export const generateCuid = () => cuid(); // e.g., "c7j2x3k4m5n6p7q8"

// Option 4: Using uuid with custom formatting
// npm install uuid
// import { v4 as uuidv4 } from 'uuid';
// export const generateUuidShort = () => {
//   return uuidv4().replace(/-/g, '').substring(0, 8).toUpperCase();
// };

// Option 5: Using timestamp-based ID (more predictable)
export const generateTimestampId = (): string => {
  const timestamp = Date.now().toString();
  // Take last 8 digits of timestamp and pad if needed
  return timestamp.slice(-8).padStart(8, '0');
};

// Option 6: Using combination of timestamp and random
export const generateTimestampRandomId = (): string => {
  const timestamp = Date.now().toString().slice(-6); // Last 6 digits
  const random = Math.floor(Math.random() * 100).toString().padStart(2, '0'); // 2 random digits
  return timestamp + random;
};

/**
 * Recommended approach for your use case:
 * 1. For sequential IDs: Use the database transaction approach in waiterIdGenerator.ts
 * 2. For short random IDs: Use nanoid (8 characters)
 * 3. For timestamp-based: Use generateTimestampId()
 */


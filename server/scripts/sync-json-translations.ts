/**
 * JSON to Database Translation Sync Script
 * Automatically registers and synchronizes all keys and values from locale JSON files.
 *
 * Run with: npx tsx server/scripts/sync-json-translations.ts
 */

import { db } from '../db';
import { languages, translationKeys, translationValues } from '@shared/schema';
import { eq, and } from 'drizzle-orm';
import * as fs from 'fs';
import * as path from 'path';

async function syncTranslations() {
  console.log('Starting synchronization of JSON translations to database...');

  // 1. Get all supported languages from database
  const dbLanguages = await db.select().from(languages);
  console.log(`Found ${dbLanguages.length} languages in database.`);

  const localesDir = path.resolve(process.cwd(), 'client/src/locales');
  const files = fs.readdirSync(localesDir).filter(f => f.endsWith('_translations.json'));

  console.log(`Found ${files.length} translation files in ${localesDir}.`);

  // We need to first seed all keys from English or from all files combined
  // English is the source of truth for keys
  const enFilePath = path.join(localesDir, 'en_translations.json');
  if (!fs.existsSync(enFilePath)) {
    throw new Error('English translation file (en_translations.json) not found.');
  }

  const enData = JSON.parse(fs.readFileSync(enFilePath, 'utf8'));

  // 2. Ensure all keys from English exist in the translationKeys table
  console.log('Synchronizing translation keys from English translation file...');
  let keysCreated = 0;
  let keysExisting = 0;

  for (const [namespace, keysObj] of Object.entries(enData)) {
    if (typeof keysObj !== 'object' || keysObj === null) continue;

    for (const [key, value] of Object.entries(keysObj as Record<string, string>)) {
      // Check if key exists
      const existingKey = await db
        .select()
        .from(translationKeys)
        .where(
          and(
            eq(translationKeys.namespace, namespace),
            eq(translationKeys.key, key)
          )
        );

      if (existingKey.length === 0) {
        await db.insert(translationKeys).values({
          namespace,
          key,
          description: `Imported from JSON: ${namespace}.${key}`,
        });
        keysCreated++;
      } else {
        keysExisting++;
      }
    }
  }
  console.log(`Keys: Created ${keysCreated}, Existing/Verified ${keysExisting}.`);

  // Fetch all keys from database to have their IDs
  const allKeys = await db.select().from(translationKeys);

  // 3. Sync translation values for each language file
  for (const file of files) {
    const langCode = file.replace('_translations.json', '');
    const dbLang = dbLanguages.find(l => l.code === langCode);

    if (!dbLang) {
      console.log(`Language code '${langCode}' (from ${file}) is not in database 'languages' table. Skipping.`);
      continue;
    }

    console.log(`\nSyncing translations for ${dbLang.name} (${langCode})...`);
    const filePath = path.join(localesDir, file);
    const data = JSON.parse(fs.readFileSync(filePath, 'utf8'));

    let valsInserted = 0;
    let valsUpdated = 0;

    for (const [namespace, keysObj] of Object.entries(data)) {
      if (typeof keysObj !== 'object' || keysObj === null) continue;

      for (const [key, value] of Object.entries(keysObj as Record<string, string>)) {
        // Find corresponding key in database
        const dbKey = allKeys.find(k => k.namespace === namespace && k.key === key);
        if (!dbKey) {
          console.warn(`  Warning: Key '${namespace}.${key}' not found in database keys. Skipping value.`);
          continue;
        }

        // Check if value already exists
        const existingVal = await db
          .select()
          .from(translationValues)
          .where(
            and(
              eq(translationValues.keyId, dbKey.id),
              eq(translationValues.languageId, dbLang.id)
            )
          );

        if (existingVal.length === 0) {
          await db.insert(translationValues).values({
            keyId: dbKey.id,
            languageId: dbLang.id,
            value: value,
            isVerified: true,
          });
          valsInserted++;
        } else {
          // Check if value changed, and update if it did
          if (existingVal[0].value !== value) {
            await db
              .update(translationValues)
              .set({ value, updatedAt: new Date() })
              .where(eq(translationValues.id, existingVal[0].id));
            valsUpdated++;
          }
        }
      }
    }
    console.log(`  Done. Inserted: ${valsInserted}, Updated: ${valsUpdated}`);
  }

  console.log('\n=== Database Translation Synchronization Complete ===');
}

syncTranslations()
  .then(() => {
    console.log('Done!');
    process.exit(0);
  })
  .catch(err => {
    console.error('Error syncing translations:', err);
    process.exit(1);
  });

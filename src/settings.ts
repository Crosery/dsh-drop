/**
 * Host-side settings schema over the shared contract. Only the Node half
 * imports this module, so the validator never reaches the browser bundle.
 * @module @crosery/dsh-drop/settings
 */

import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_FOLDER_IGNORE, DEFAULT_FOLDER_MAX_BYTES, DEFAULT_FOLDER_MAX_DEPTH, DEFAULT_FOLDER_MAX_FILES,
  DEFAULT_KEEP_DAYS, DEFAULT_MAX_BYTES, FOLDER_IGNORE_FIELD, FOLDER_MAX_BYTES_FIELD, FOLDER_MAX_DEPTH_FIELD,
  FOLDER_MAX_FILES_FIELD, KEEP_DAYS_FIELD, MAX_BYTES_FIELD,
  type DropSettings,
} from './contract.ts'

/**
 * Durable schema for the plugin's settings.
 *
 * Both defaults describe the behavior the plugin exists to provide, so an empty
 * composition row is the intended configuration. The descriptions are what the
 * 0.1.7 Settings page shows beside each field: that page builds its form from
 * this exported schema.
 */
export const DropSettingsSchema: z<DropSettings> = z.object({
  [MAX_BYTES_FIELD]: z.natural().default(DEFAULT_MAX_BYTES)
    .description('Largest file, in bytes, that a drop may copy to the Host. Default 512 MiB.'),
  [KEEP_DAYS_FIELD]: z.natural().default(DEFAULT_KEEP_DAYS)
    .description('Days to keep copied files under DSH_HOME/drops; 0 keeps them forever.'),
  [FOLDER_MAX_FILES_FIELD]: z.natural().default(DEFAULT_FOLDER_MAX_FILES)
    .description('Most files a dropped folder may hold when it has to be copied; a larger folder is refused whole. Default 2000.'),
  [FOLDER_MAX_BYTES_FIELD]: z.natural().default(DEFAULT_FOLDER_MAX_BYTES)
    .description('Most bytes, in total, a dropped folder may hold when it has to be copied. Default 512 MiB.'),
  [FOLDER_MAX_DEPTH_FIELD]: z.natural().default(DEFAULT_FOLDER_MAX_DEPTH)
    .description('Deepest nesting, in levels below the folder, a copied folder may have. Default 32.'),
  [FOLDER_IGNORE_FIELD]: z.array(z.string()).default([...DEFAULT_FOLDER_IGNORE])
    .description('Names skipped (and counted) when a folder is copied, matched exactly against each file or folder name.'),
})

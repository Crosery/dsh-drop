/**
 * Host-side settings schema over the shared contract. Only the Node half
 * imports this module, so the validator never reaches the browser bundle.
 * @module @crosery/dsh-drop/settings
 */

import z from '@deepseek-ai/schemastery'
import {
  DEFAULT_KEEP_DAYS, DEFAULT_MAX_BYTES, KEEP_DAYS_FIELD, MAX_BYTES_FIELD,
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
})

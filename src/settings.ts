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
 * Durable schema for the `crosery-drop` section.
 *
 * Both defaults describe the behavior the plugin exists to provide, so an empty
 * composition row is the intended configuration.
 */
export const DropSettingsSchema: z<DropSettings> = z.object({
  [MAX_BYTES_FIELD]: z.natural().default(DEFAULT_MAX_BYTES),
  [KEEP_DAYS_FIELD]: z.natural().default(DEFAULT_KEEP_DAYS),
})

/**
 * Host-side settings schema over the shared contract. Only the Node half
 * imports this module, so the validator never reaches the browser bundle.
 * @module @crosery/dsh-drop/settings
 */
import z from '@deepseek-ai/schemastery';
import { type DropSettings } from './contract.ts';
/**
 * Durable schema for the plugin's settings.
 *
 * Both defaults describe the behavior the plugin exists to provide, so an empty
 * composition row is the intended configuration. The descriptions are what the
 * 0.1.7 Settings page shows beside each field: that page builds its form from
 * this exported schema.
 */
export declare const DropSettingsSchema: z<DropSettings>;

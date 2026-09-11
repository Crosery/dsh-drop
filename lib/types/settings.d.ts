/**
 * Host-side settings schema over the shared contract. Only the Node half
 * imports this module, so the validator never reaches the browser bundle.
 * @module @crosery/dsh-drop/settings
 */
import z from '@deepseek-ai/schemastery';
import { type DropSettings } from './contract.ts';
/**
 * Durable schema for the `crosery-drop` section.
 *
 * Both defaults describe the behavior the plugin exists to provide, so an empty
 * composition row is the intended configuration.
 */
export declare const DropSettingsSchema: z<DropSettings>;

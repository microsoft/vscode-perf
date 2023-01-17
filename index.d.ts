/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

export interface Options {
	/**
	 * executable location of the build to measure the performance of
	 */
	readonly build: string;

	/**
	 * pair of markers separated by `-` between which the duration has to be measured. Eg: `code/didLoadWorkbenchMain-code/didLoadExtensions
	 */
	readonly durationMarkers?: string | string[];

	/**
	 * file in which the performance measurements shall be recorded
	 */
	readonly durationMarkersFile?: string;

	/**
	 * number of times to run the performance measurement
	 */
	readonly runs?: string;

	/**
	 * folder to open in VSCode while measuring the performance
	 */
	readonly folder?: string;

	/**
	 * file to open in VSCode while measuring the performance
	 */
	readonly file?: string;

	/**
	 * logs verbose output to the console when errors occur
	 */
	readonly verbose?: boolean;

	/**
	 * file in which the profile data shall be recorded
	 */
	readonly profAppendTimers?: string;
}

export function run(options?: Options): Promise<void>;
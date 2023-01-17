/*---------------------------------------------------------------------------------------------
 *  Copyright (c) Microsoft Corporation. All rights reserved.
 *  Licensed under the MIT License. See LICENSE in the project root for license information.
 *--------------------------------------------------------------------------------------------*/

import chalk from 'chalk';
import { Option, OptionValues, program } from 'commander';
import { launch } from './perf';

interface Options extends OptionValues {
	build: string;
	durationMarkers?: string | string[];
	durationMarkersFile: string;
	runs?: string;
	folder?: string;
	file?: string;
	profAppendTimers?: string;
}

export async function run(options?: Options): Promise<void> {

	if (!options) {
		program
			.requiredOption('-b, --build <build>', 'executable location of the build to measure the performance of')
			.option('-m, --duration-markers <duration-markers>', 'pair of markers separated by `-` between which the duration has to be measured. Eg: `code/didLoadWorkbenchMain-code/didLoadExtensions')
			.option('--duration-markers-file <duration-markers-file>', 'file in which the performance measurements shall be recorded')
			.option('--folder <folder>', 'folder to open in VSCode while measuring the performance')
			.option('--file <file>', 'file to open in VSCode while measuring the performance')
			.option('--runs <number-of-runs>', 'number of times to run the performance measurement')
			.addOption(new Option('--prof-append-timers <prof-append-timers>').hideHelp(true));

		options = program.parse(process.argv).opts<Options>();
	}

	try {
		await launch({
			build: options.build,
			durationMarkers: options.durationMarkers ? Array.isArray(options.durationMarkers) ? options.durationMarkers : [options.durationMarkers] : undefined,
			durationMarkersFile: options.durationMarkersFile,
			runs: options.runs ? parseInt(options.runs) : undefined,
			folderToOpen: options.folder,
			fileToOpen: options.file,
			profAppendTimers: options.profAppendTimers
		});
	} catch (error) {
		console.log(`${chalk.red('[error]')} ${error}`);
		process.exit(1);
	}
}